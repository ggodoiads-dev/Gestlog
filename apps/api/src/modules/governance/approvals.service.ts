import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { CreateApprovalDto, DecisionDto } from './governance.dto';

/**
 * Serialização canônica de um objeto para comparação por hash. Ordena as
 * chaves em todos os níveis para que `{a:1,b:2}` == `{b:2,a:1}`.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const parts = keys.map(
    (k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`,
  );
  return `{${parts.join(',')}}`;
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

interface ApprovalView {
  id: string;
  subjectType: string;
  subjectId: string;
  subjectVersion: number;
  state: string;
  requiredApprovals: number;
  approvalsReceived: number;
  reason: string;
  amountCents: string | null;
  currency: string | null;
  requestedBy: string;
  createdAt: string;
  decidedAt: string | null;
  steps: {
    approverId: string;
    decision: string;
    comment: string | null;
    decidedAt: string;
  }[];
}

/**
 * Serviço de aprovações (prompt mestre §15).
 *
 * Invariantes não-negociáveis implementadas aqui:
 *
 *   1. **Server-side authority**. O guard já valida a permissão
 *      `governance.approvals.decide` antes de chegar aqui; o service
 *      valida que o decisor NÃO é o solicitante (SoD).
 *
 *   2. **Sem autoaprovação**. `requestedBy === approverId` → 403.
 *
 *   3. **Decisão idempotente por aprovador**. Unique
 *      `(requestId, approverId)` no banco; dois votos do mesmo
 *      aprovador → 409.
 *
 *   4. **Sem aprovação tácita**. Um pedido só vira APPROVED quando o
 *      número de APPROVE atinge `requiredApprovals`. REJECT por qualquer
 *      aprovador fecha para REJECTED imediatamente.
 *
 *   5. **Mudança material invalida pedido antigo**. Reabertura com
 *      snapshot diferente → novo request (feito pelo chamador); o
 *      service aceita que o chamador marque pedidos antigos como
 *      SUPERSEDED via `cancel`.
 */
@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Devolve o snapshot canônico atual do subject para checagem AT-04.
   * Suporta hoje PayableInvoice e Receivable; outros tipos devolvem null
   * (check é pulado). O resolver cresce com o produto.
   */
  private async currentSubjectSnapshot(
    tx: PrismaClient,
    subjectType: string,
    subjectId: string,
  ): Promise<Record<string, unknown> | null> {
    switch (subjectType) {
      case 'payable_invoice': {
        const p = await tx.payableInvoice.findUnique({ where: { id: subjectId } });
        if (!p) return null;
        return {
          amountCents: p.amountCents.toString(),
          supplierName: p.supplierName,
          supplierCnpj: p.supplierCnpj ?? null,
          description: p.description,
          dueDate: p.dueDate.toISOString().slice(0, 10),
          classification: p.classification,
        };
      }
      case 'receivable': {
        const r = await tx.receivable.findUnique({ where: { id: subjectId } });
        if (!r) return null;
        return {
          amountCents: r.amountCents.toString(),
          contractId: r.contractId,
          clientId: r.clientId,
          competenceYear: r.competenceYear,
          competenceMonth: r.competenceMonth,
          dueDate: r.dueDate.toISOString().slice(0, 10),
        };
      }
      default:
        return null;
    }
  }

  async create(
    ctx: { tenantId: string; userId: string },
    dto: CreateApprovalDto,
  ): Promise<ApprovalView> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      // AT-06 oficial: detecta fracionamento. Soma pedidos do mesmo
      // requester + mesmo "supplierName" (quando presente no snapshot) nos
      // últimos 7 dias em state ∈ (PENDING, APPROVED) de subject_type =
      // payable_invoice. Se a soma + esta > FRACTIONATION_THRESHOLD_CENTS,
      // bloqueia com 409 FRACTIONATION_DETECTED.
      if (
        dto.subjectType === 'payable_invoice' &&
        dto.amountCents !== undefined
      ) {
        const supplierName = (dto.snapshot as Record<string, unknown>)
          ?.supplierName;
        if (typeof supplierName === 'string' && supplierName.length > 0) {
          const windowStart = new Date(Date.now() - 7 * 86_400_000);
          const peers = await tx.approvalRequest.findMany({
            where: {
              requestedBy: ctx.userId,
              subjectType: 'payable_invoice',
              state: { in: ['PENDING', 'APPROVED'] },
              createdAt: { gte: windowStart },
              amountCents: { not: null },
            },
            select: { id: true, amountCents: true, snapshotJson: true },
          });
          const sameSupplier = peers.filter((p) => {
            const snap = p.snapshotJson as Record<string, unknown> | null;
            return (
              snap !== null &&
              typeof snap?.supplierName === 'string' &&
              snap.supplierName === supplierName
            );
          });
          const sumPrevious = sameSupplier.reduce(
            (acc, p) => acc + (p.amountCents ?? 0n),
            0n,
          );
          const total = sumPrevious + dto.amountCents;
          const threshold = BigInt(
            process.env.GOVERNANCE_FRACTIONATION_THRESHOLD_CENTS ?? '1000000',
          );
          if (total > threshold && sameSupplier.length >= 1) {
            throw new ConflictException({
              message:
                'soma de pedidos do mesmo solicitante para o mesmo fornecedor em 7 dias ultrapassa o limite de fracionamento — crie um pedido único com o valor total',
              code: 'FRACTIONATION_DETECTED',
              supplierName,
              totalCents: total.toString(),
              thresholdCents: threshold.toString(),
              peerRequestIds: sameSupplier.map((p) => p.id),
            });
          }
        }
      }

      const req = await tx.approvalRequest.create({
        data: {
          tenantId: ctx.tenantId,
          subjectType: dto.subjectType,
          subjectId: dto.subjectId,
          subjectVersion: dto.subjectVersion,
          requestedBy: ctx.userId,
          reason: dto.reason,
          ...(dto.amountCents !== undefined ? { amountCents: dto.amountCents } : {}),
          ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
          requiredApprovals: dto.requiredApprovals,
          ...(dto.slaMinutes !== undefined ? { slaMinutes: dto.slaMinutes } : {}),
          snapshotJson: dto.snapshot as Prisma.InputJsonValue,
        },
      });
      return this.load(tx, req.id);
    });
  }

  /**
   * AT-05: marca como EXPIRED todos os pedidos cujo prazo (createdAt +
   * slaMinutes) estourou enquanto ainda estavam PENDING. Retorna quantos
   * foram afetados. Chamado por job periódico OU manualmente pelo admin
   * via POST /v1/approvals/expire-stale.
   */
  async expireStale(ctx: {
    tenantId: string;
    userId: string;
  }): Promise<{ expired: number }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const pendings = await tx.approvalRequest.findMany({
        where: { state: 'PENDING' },
        select: { id: true, createdAt: true, slaMinutes: true },
      });
      const now = Date.now();
      const ids = pendings
        .filter((p) => now > p.createdAt.getTime() + p.slaMinutes * 60_000)
        .map((p) => p.id);
      if (ids.length === 0) return { expired: 0 };
      await tx.approvalRequest.updateMany({
        where: { id: { in: ids } },
        data: { state: 'EXPIRED', expiredAt: new Date() },
      });
      await this.audit.recordInTx(tx, ctx, {
        action: 'governance.approval.expire-stale',
        subjectType: 'ApprovalBatch',
        subjectId: ids[0]!, // uuid válido
        after: { expiredCount: ids.length, ids },
      });
      return { expired: ids.length };
    });
  }

  async decide(
    ctx: { tenantId: string; userId: string },
    requestId: string,
    dto: DecisionDto,
  ): Promise<ApprovalView> {
    try {
      return await this.decideInTx(ctx, requestId, dto);
    } catch (err) {
      // AT-05: se expirou durante APPROVE, marca EXPIRED fora da tx e
      // re-lança um ConflictException limpo (sem o sentinel).
      const resp =
        err instanceof ConflictException ? (err.getResponse() as unknown) : null;
      const sentinel =
        resp && typeof resp === 'object' && '__markExpired' in resp
          ? (resp as { __markExpired: string }).__markExpired
          : null;
      if (sentinel) {
        await this.prisma.withTenantFromCtx(ctx, async (tx2) => {
          await tx2.approvalRequest.update({
            where: { id: sentinel },
            data: { state: 'EXPIRED', expiredAt: new Date() },
          });
          await this.audit.recordInTx(tx2, ctx, {
            action: 'governance.approval.expire-on-decide',
            subjectType: 'ApprovalRequest',
            subjectId: sentinel,
            before: { state: 'PENDING' },
            after: { state: 'EXPIRED' },
          });
        });
        const { __markExpired: _drop, ...clean } = resp as {
          __markExpired: string;
          [k: string]: unknown;
        };
        void _drop;
        throw new ConflictException(clean);
      }
      throw err;
    }
  }

  private async decideInTx(
    ctx: { tenantId: string; userId: string },
    requestId: string,
    dto: DecisionDto,
  ): Promise<ApprovalView> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const req = await tx.approvalRequest.findUnique({
        where: { id: requestId },
        include: { steps: true },
      });
      if (!req) throw new NotFoundException('pedido não encontrado');

      if (req.state !== 'PENDING') {
        throw new ConflictException(
          `pedido ${req.state.toLowerCase()} — não aceita nova decisão`,
        );
      }

      // AT-05: SLA estourou antes do voto? NÃO aprova por silêncio.
      // Sinalizamos aqui; a tx atual não pode persistir o EXPIRED (o throw
      // vai desfazer tudo). Fazemos a marcação em transação isolada após
      // retornar o erro.
      const deadline = req.createdAt.getTime() + req.slaMinutes * 60_000;
      const expired = dto.decision === 'APPROVE' && Date.now() > deadline;
      if (expired) {
        // Abrir nova tx tenant-escopada, independente da atual.
        // (Fora da outer tx: a RLS requer SET LOCAL app.current_tenant,
        //  então chamamos via withTenantFromCtx abaixo depois de sair daqui.)
        throw new ConflictException({
          message:
            'pedido expirou — SLA estourou antes da decisão; NUNCA aprova por silêncio (AT-05)',
          code: 'EXPIRED',
          slaMinutes: req.slaMinutes,
          createdAt: req.createdAt.toISOString(),
          __markExpired: requestId, // sentinel para o catch externo
        });
      }

      // Invariante §15: sem autoaprovação.
      if (req.requestedBy === ctx.userId) {
        throw new ForbiddenException(
          'autoaprovação proibida — solicitante não pode decidir seu próprio pedido',
        );
      }

      // AT-04: mudança material no subject invalida a decisão em curso.
      // Comparamos o hash canônico do snapshot armazenado com o snapshot
      // atual do subject. Se o chamador tenta aprovar, rejeitamos; RETURN
      // e REJECT seguem (o aprovador tem o direito de barrar).
      if (dto.decision === 'APPROVE') {
        const currentSnapshot = await this.currentSubjectSnapshot(
          tx,
          req.subjectType,
          req.subjectId,
        );
        if (currentSnapshot !== null) {
          const savedHash = sha256(canonicalJson(req.snapshotJson));
          const currentHash = sha256(canonicalJson(currentSnapshot));
          if (savedHash !== currentHash) {
            throw new ConflictException({
              message:
                'subject mudou materialmente desde o pedido — crie novo pedido com snapshot atualizado',
              code: 'MATERIAL_CHANGED',
              subjectType: req.subjectType,
              subjectId: req.subjectId,
            });
          }
        }
      }

      // Já decidiu antes? unique constraint protege, mas damos erro claro.
      if (req.steps.some((s) => s.approverId === ctx.userId)) {
        throw new ConflictException('você já decidiu este pedido');
      }

      // Registra a decisão (unique (requestId, approverId)).
      try {
        await tx.approvalStep.create({
          data: {
            tenantId: ctx.tenantId,
            requestId,
            approverId: ctx.userId,
            decision: dto.decision,
            ...(dto.comment !== undefined ? { comment: dto.comment } : {}),
          },
        });
      } catch (err) {
        const code =
          typeof err === 'object' && err !== null && 'code' in err
            ? (err as { code?: string }).code
            : undefined;
        if (code === 'P2002') {
          throw new ConflictException('voto duplicado detectado (corrida)');
        }
        throw err;
      }

      // Atualiza estado agregado.
      if (dto.decision === 'REJECT') {
        await tx.approvalRequest.update({
          where: { id: requestId },
          data: { state: 'REJECTED', decidedAt: new Date() },
        });
      } else if (dto.decision === 'RETURN') {
        await tx.approvalRequest.update({
          where: { id: requestId },
          data: { state: 'RETURNED', decidedAt: new Date() },
        });
      } else {
        const approves = req.steps.filter((s) => s.decision === 'APPROVE').length + 1;
        if (approves >= req.requiredApprovals) {
          await tx.approvalRequest.update({
            where: { id: requestId },
            data: { state: 'APPROVED', decidedAt: new Date() },
          });
        }
      }

      await this.audit.recordInTx(tx, ctx, {
        action: `governance.decide.${dto.decision.toLowerCase()}`,
        subjectType: 'ApprovalRequest',
        subjectId: requestId,
        ...(dto.comment !== undefined ? { reason: dto.comment } : {}),
        before: { state: req.state },
        after: { decision: dto.decision, approverId: ctx.userId },
      });

      return this.load(tx, requestId);
    });
  }

  async detail(
    ctx: { tenantId: string },
    requestId: string,
  ): Promise<ApprovalView> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      return this.load(tx, requestId);
    });
  }

  async list(
    ctx: { tenantId: string },
    state?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'RETURNED' | 'CANCELLED' | 'SUPERSEDED',
  ): Promise<{ items: ApprovalView[] }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const rows = await tx.approvalRequest.findMany({
        where: state ? { state } : {},
        include: { steps: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      return {
        items: rows.map((r) => this.toView(r)),
      };
    });
  }

  async cancel(
    ctx: { tenantId: string; userId: string },
    requestId: string,
    reason: string,
  ): Promise<ApprovalView> {
    if (!reason || reason.trim().length < 3) {
      throw new BadRequestException('reason obrigatório (mín. 3 caracteres)');
    }
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const req = await tx.approvalRequest.findUnique({ where: { id: requestId } });
      if (!req) throw new NotFoundException('pedido não encontrado');
      if (req.state !== 'PENDING') {
        throw new ConflictException('só pedidos PENDING podem ser cancelados');
      }
      if (req.requestedBy !== ctx.userId) {
        throw new ForbiddenException('somente o solicitante original pode cancelar o pedido');
      }
      await tx.approvalRequest.update({
        where: { id: requestId },
        data: { state: 'CANCELLED', decidedAt: new Date() },
      });
      return this.load(tx, requestId);
    });
  }

  // --------------------------------------------------------------------------

  private async load(
    tx: Parameters<Parameters<PrismaService['withTenantFromCtx']>[1]>[0],
    requestId: string,
  ): Promise<ApprovalView> {
    const r = await tx.approvalRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { steps: { orderBy: { decidedAt: 'asc' } } },
    });
    return this.toView(r);
  }

  private toView(r: {
    id: string;
    subjectType: string;
    subjectId: string;
    subjectVersion: number;
    state: string;
    requiredApprovals: number;
    reason: string;
    amountCents: bigint | null;
    currency: string | null;
    requestedBy: string;
    createdAt: Date;
    decidedAt: Date | null;
    steps: {
      approverId: string;
      decision: string;
      comment: string | null;
      decidedAt: Date;
    }[];
  }): ApprovalView {
    return {
      id: r.id,
      subjectType: r.subjectType,
      subjectId: r.subjectId,
      subjectVersion: r.subjectVersion,
      state: r.state,
      requiredApprovals: r.requiredApprovals,
      approvalsReceived: r.steps.filter((s) => s.decision === 'APPROVE').length,
      reason: r.reason,
      amountCents: r.amountCents ? r.amountCents.toString() : null,
      currency: r.currency,
      requestedBy: r.requestedBy,
      createdAt: r.createdAt.toISOString(),
      decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
      steps: r.steps.map((s) => ({
        approverId: s.approverId,
        decision: s.decision,
        comment: s.comment,
        decidedAt: s.decidedAt.toISOString(),
      })),
    };
  }
}
