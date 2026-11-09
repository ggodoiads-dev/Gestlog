import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
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
  ) {}

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
          currency: r.currency,
          dueDate: r.dueDate.toISOString().slice(0, 10),
          status: r.status,
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
