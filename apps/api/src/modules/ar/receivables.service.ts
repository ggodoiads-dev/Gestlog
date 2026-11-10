import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';

interface IssueOptions {
  dueDate?: string; // YYYY-MM-DD; default = dia 10 do mês seguinte à competência
}

interface ReceivableResult {
  id: string;
  contractId: string;
  clientId: string;
  competence: string;
  amountCents: string;
  currency: string;
  status: string;
  dueDate: string;
  issuedAt: string;
  wasAlreadyIssued: boolean;
}

/**
 * Serviço de contas a receber.
 *
 * Invariante: emitir a mesma pré-fatura (contract × competência) duas
 * vezes retorna o MESMO Receivable (unique nativo). O valor do
 * Receivable é um snapshot da pré-fatura NO MOMENTO da emissão; novas
 * medições adicionadas depois NÃO alteram o valor emitido.
 *
 * Fatos relacionados que virão em próximas iterações:
 *   - Integração fiscal (NFS-e / CT-e OS) — ADR dedicado por provedor.
 *   - Pagamentos (Receipt) com alocação 1:N e conciliação bancária.
 *   - Aging / cobrança — módulo Working Capital.
 */
@Injectable()
export class ReceivablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
  ) {}

  /**
   * AT-23 — registra contestação. `contestedCents` deve ser ≤ amount − paid.
   * Passar 0 "resolve" a contestação (zera).
   */
  async dispute(
    ctx: { tenantId: string; userId: string },
    receivableId: string,
    dto: { contestedCents: number; reason: string },
  ): Promise<{
    id: string;
    contestedCents: string;
    uncontestedCents: string;
    paidCents: string;
  }> {
    if (!Number.isInteger(dto.contestedCents) || dto.contestedCents < 0) {
      throw new BadRequestException('contestedCents inválido');
    }
    if (!dto.reason || dto.reason.trim().length < 3) {
      throw new BadRequestException('reason obrigatório (≥ 3 caracteres)');
    }
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const r = await tx.receivable.findUnique({ where: { id: receivableId } });
      if (!r) throw new NotFoundException('recebível não encontrado');
      const contested = BigInt(dto.contestedCents);
      const balance = r.amountCents - r.paidCents;
      if (contested > balance) {
        throw new ConflictException(
          `contested (${contested.toString()}) excede saldo em aberto (${balance.toString()})`,
        );
      }
      const updated = await tx.receivable.update({
        where: { id: receivableId },
        data: {
          contestedCents: contested,
          disputeReason: contested > 0n ? dto.reason : null,
          disputedAt: contested > 0n ? new Date() : null,
          disputedBy: contested > 0n ? ctx.userId : null,
        },
      });
      await this.audit.recordInTx(tx, ctx, {
        action: contested > 0n ? 'ar.receivable.dispute' : 'ar.receivable.dispute.resolve',
        subjectType: 'Receivable',
        subjectId: receivableId,
        reason: dto.reason,
        before: { contestedCents: r.contestedCents.toString() },
        after: { contestedCents: contested.toString() },
      });
      return {
        id: updated.id,
        contestedCents: updated.contestedCents.toString(),
        uncontestedCents: (updated.amountCents - updated.contestedCents).toString(),
        paidCents: updated.paidCents.toString(),
      };
    });
  }

  /**
   * AT-25 — marca o recebível como antecipado. Nova antecipação do mesmo
   * recebível retorna 409. Recebível com contestação em aberto NÃO pode
   * ser antecipado.
   */
  async anticipate(
    ctx: { tenantId: string; userId: string },
    receivableId: string,
    dto: { reference: string },
  ): Promise<{
    id: string;
    anticipatedAt: string;
    reference: string;
  }> {
    if (!dto.reference || dto.reference.trim().length < 3) {
      throw new BadRequestException('reference obrigatório (≥ 3 caracteres)');
    }
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const r = await tx.receivable.findUnique({ where: { id: receivableId } });
      if (!r) throw new NotFoundException('recebível não encontrado');
      if (r.anticipatedAt !== null) {
        throw new ConflictException({
          message:
            'recebível já foi antecipado em operação anterior; antecipação dupla é bloqueada (AT-25)',
          code: 'ALREADY_ANTICIPATED',
          anticipatedAt: r.anticipatedAt.toISOString(),
          reference: r.anticipationReference,
        });
      }
      if (r.contestedCents > 0n) {
        throw new ConflictException({
          message:
            'recebível tem valor contestado em aberto; resolva a contestação antes de antecipar',
          code: 'HAS_DISPUTE',
          contestedCents: r.contestedCents.toString(),
        });
      }
      if (r.status === 'PAID') {
        throw new ConflictException('recebível já quitado — nada a antecipar');
      }
      const now = new Date();
      const updated = await tx.receivable.update({
        where: { id: receivableId },
        data: {
          anticipatedAt: now,
          anticipatedBy: ctx.userId,
          anticipationReference: dto.reference,
        },
      });
      await this.audit.recordInTx(tx, ctx, {
        action: 'ar.receivable.anticipate',
        subjectType: 'Receivable',
        subjectId: receivableId,
        after: { anticipatedAt: now.toISOString(), reference: dto.reference },
      });
      return {
        id: updated.id,
        anticipatedAt: now.toISOString(),
        reference: dto.reference,
      };
    });
  }

  async issueFromPreInvoice(
    ctx: { tenantId: string; userId: string },
    contractId: string,
    competenceYear: number,
    competenceMonth: number,
    opts: IssueOptions = {},
  ): Promise<ReceivableResult> {
    if (
      !Number.isInteger(competenceYear) ||
      competenceYear < 2000 ||
      competenceYear > 2100
    ) {
      throw new BadRequestException('ano de competência inválido');
    }
    if (!Number.isInteger(competenceMonth) || competenceMonth < 1 || competenceMonth > 12) {
      throw new BadRequestException('mês de competência deve ser 1..12');
    }

    const preInvoice = await this.billing.preInvoice(
      ctx,
      contractId,
      competenceYear,
      competenceMonth,
    );
    if (preInvoice.items.length === 0) {
      throw new BadRequestException(
        'não há medições para esta competência — nada a emitir',
      );
    }
    const totalCents = BigInt(preInvoice.totalAmountCents);

    const dueDate = opts.dueDate
      ? new Date(`${opts.dueDate}T00:00:00Z`)
      : defaultDueDate(competenceYear, competenceMonth);

    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const existing = await tx.receivable.findUnique({
        where: {
          tenantId_contractId_competenceYear_competenceMonth: {
            tenantId: ctx.tenantId,
            contractId,
            competenceYear,
            competenceMonth,
          },
        },
      });
      if (existing) {
        return toResult(existing, preInvoice, true);
      }

      const contract = await tx.contract.findUnique({ where: { id: contractId } });
      if (!contract) throw new NotFoundException('contrato não encontrado');

      try {
        const created = await tx.receivable.create({
          data: {
            tenantId: ctx.tenantId,
            contractId,
            clientId: contract.clientId,
            competenceYear,
            competenceMonth,
            amountCents: totalCents,
            currency: preInvoice.currency,
            dueDate,
            status: 'OPEN',
          },
        });
        return toResult(created, preInvoice, false);
      } catch (err) {
        const code =
          typeof err === 'object' && err !== null && 'code' in err
            ? (err as { code?: string }).code
            : undefined;
        if (code === 'P2002') {
          throw new ConflictException(
            'competência já tem um receivable emitido (corrida); refaça para obter o atual',
          );
        }
        throw err;
      }
    });
  }

  async listOpen(
    ctx: { tenantId: string },
  ): Promise<{
    items: {
      id: string;
      contractId: string;
      clientId: string;
      competence: string;
      amountCents: string;
      paidCents: string;
      balanceCents: string;
      currency: string;
      dueDate: string;
      status: string;
    }[];
  }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const rows = await tx.receivable.findMany({
        where: { status: { in: ['OPEN', 'PARTIALLY_PAID'] } },
        orderBy: { dueDate: 'asc' },
      });
      return {
        items: rows.map((r) => ({
          id: r.id,
          contractId: r.contractId,
          clientId: r.clientId,
          competence: `${r.competenceYear}-${String(r.competenceMonth).padStart(2, '0')}`,
          amountCents: r.amountCents.toString(),
          paidCents: r.paidCents.toString(),
          balanceCents: (r.amountCents - r.paidCents).toString(),
          currency: r.currency,
          dueDate: r.dueDate.toISOString().slice(0, 10),
          status: r.status,
        })),
      };
    });
  }

  async detail(
    ctx: { tenantId: string },
    id: string,
  ): Promise<{
    id: string;
    contractId: string;
    contractCode: string;
    clientId: string;
    clientName: string;
    competence: string;
    amountCents: string;
    paidCents: string;
    balanceCents: string;
    currency: string;
    status: string;
    dueDate: string;
    issuedAt: string;
    paidAt: string | null;
    allocations: {
      receiptId: string;
      amountCents: string;
      receivedAt: string;
      source: string;
      reference: string | null;
    }[];
  } | null> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const r = await tx.receivable.findUnique({
        where: { id },
        include: {
          allocations: {
            include: { receipt: true },
            orderBy: { receipt: { receivedAt: 'desc' } },
          },
        },
      });
      if (!r) return null;
      const contract = await tx.contract.findUnique({
        where: { id: r.contractId },
        include: { client: true },
      });
      return {
        id: r.id,
        contractId: r.contractId,
        contractCode: contract?.code ?? '?',
        clientId: r.clientId,
        clientName: contract?.client.legalName ?? '?',
        competence: `${r.competenceYear}-${String(r.competenceMonth).padStart(2, '0')}`,
        amountCents: r.amountCents.toString(),
        paidCents: r.paidCents.toString(),
        balanceCents: (r.amountCents - r.paidCents).toString(),
        currency: r.currency,
        status: r.status,
        dueDate: r.dueDate.toISOString().slice(0, 10),
        issuedAt: r.issuedAt.toISOString(),
        paidAt: r.paidAt ? r.paidAt.toISOString() : null,
        allocations: r.allocations.map((a) => ({
          receiptId: a.receiptId,
          amountCents: a.amountCents.toString(),
          receivedAt: a.receipt.receivedAt.toISOString(),
          source: a.receipt.source,
          reference: a.receipt.reference,
        })),
      };
    });
  }
}

function defaultDueDate(year: number, month: number): Date {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return new Date(Date.UTC(nextYear, nextMonth - 1, 10));
}

function toResult(
  row: {
    id: string;
    contractId: string;
    clientId: string;
    competenceYear: number;
    competenceMonth: number;
    amountCents: bigint;
    currency: string;
    status: string;
    dueDate: Date;
    issuedAt: Date;
  },
  _pre: { currency: string; totalAmountCents: string },
  wasAlreadyIssued: boolean,
): ReceivableResult {
  return {
    id: row.id,
    contractId: row.contractId,
    clientId: row.clientId,
    competence: `${row.competenceYear}-${String(row.competenceMonth).padStart(2, '0')}`,
    amountCents: row.amountCents.toString(),
    currency: row.currency,
    status: row.status,
    dueDate: row.dueDate.toISOString().slice(0, 10),
    issuedAt: row.issuedAt.toISOString(),
    wasAlreadyIssued,
  };
}
