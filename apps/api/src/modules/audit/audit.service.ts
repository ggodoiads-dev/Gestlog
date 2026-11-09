import { Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

/**
 * Append-only store de fatos auditáveis. A role do app (gestlog_app) só
 * recebe GRANT SELECT+INSERT em audit.audit_events; qualquer UPDATE/DELETE
 * falha com "permission denied" no banco. AT-28.
 *
 * Toda chamada acontece DENTRO da transação do fato que está sendo auditado:
 * ou os dois são escritos, ou nenhum.
 */

export interface AuditRecordInput {
  action: string;
  subjectType: string;
  subjectId: string;
  subjectVersion?: number;
  reason?: string;
  before?: unknown;
  after?: unknown;
}

export interface AuditContext {
  tenantId: string;
  userId: string;
  correlationId?: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  async recordInTx(
    tx: PrismaClient,
    ctx: AuditContext,
    input: AuditRecordInput,
  ): Promise<void> {
    await tx.auditEvent.create({
      data: {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        ...(ctx.correlationId ? { correlationId: ctx.correlationId } : {}),
        action: input.action,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        ...(input.subjectVersion !== undefined ? { subjectVersion: input.subjectVersion } : {}),
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
        ...(input.before !== undefined
          ? { before: input.before as object }
          : {}),
        ...(input.after !== undefined ? { after: input.after as object } : {}),
        ...(ctx.ip ? { ip: ctx.ip } : {}),
        ...(ctx.userAgent ? { userAgent: ctx.userAgent } : {}),
      },
    });
  }

  async list(
    tx: PrismaClient,
    tenantId: string,
    filter: {
      subjectType?: string;
      subjectId?: string;
      action?: string;
      actorUserId?: string;
      from?: Date;
      to?: Date;
    },
    limit = 100,
  ): Promise<
    {
      id: string;
      action: string;
      subjectType: string;
      subjectId: string;
      subjectVersion: number | null;
      actorUserId: string | null;
      actor: { email: string; fullName: string } | null;
      reason: string | null;
      before: unknown;
      after: unknown;
      createdAt: Date;
    }[]
  > {
    const rows = await tx.auditEvent.findMany({
      where: {
        tenantId,
        ...(filter.subjectType ? { subjectType: filter.subjectType } : {}),
        ...(filter.subjectId ? { subjectId: filter.subjectId } : {}),
        ...(filter.action ? { action: filter.action } : {}),
        ...(filter.actorUserId ? { actorUserId: filter.actorUserId } : {}),
        ...(filter.from || filter.to
          ? {
              createdAt: {
                ...(filter.from ? { gte: filter.from } : {}),
                ...(filter.to ? { lte: filter.to } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
    });

    // Carrega atores em batch (fuga de N+1).
    const actorIds = Array.from(
      new Set(rows.map((r) => r.actorUserId).filter((x): x is string => !!x)),
    );
    const actors =
      actorIds.length > 0
        ? await tx.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, email: true, fullName: true },
          })
        : [];
    const byId = new Map(actors.map((a) => [a.id, a]));

    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      subjectType: r.subjectType,
      subjectId: r.subjectId,
      subjectVersion: r.subjectVersion,
      actorUserId: r.actorUserId,
      actor: r.actorUserId
        ? byId.get(r.actorUserId)
          ? {
              email: byId.get(r.actorUserId)!.email,
              fullName: byId.get(r.actorUserId)!.fullName,
            }
          : null
        : null,
      reason: r.reason,
      before: r.before as unknown,
      after: r.after as unknown,
      createdAt: r.createdAt,
    }));
  }
}
