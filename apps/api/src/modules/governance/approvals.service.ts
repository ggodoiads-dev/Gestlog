import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import type { CreateApprovalDto, DecisionDto } from './governance.dto';

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
  constructor(private readonly prisma: PrismaService) {}

  async create(
    ctx: { tenantId: string; userId: string },
    dto: CreateApprovalDto,
  ): Promise<ApprovalView> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
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
          snapshotJson: dto.snapshot as Prisma.InputJsonValue,
        },
      });
      return this.load(tx, req.id);
    });
  }

  async decide(
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

      // Invariante §15: sem autoaprovação.
      if (req.requestedBy === ctx.userId) {
        throw new ForbiddenException(
          'autoaprovação proibida — solicitante não pode decidir seu próprio pedido',
        );
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
