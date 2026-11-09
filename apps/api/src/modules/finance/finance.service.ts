import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

interface DRE {
  legalEntityId: string;
  year: number;
  month: number;
  currency: string;
  revenueCents: string;
  opexCents: string;
  ebitdaCents: string;
  /** basis points (100 = 1%). */
  marginBps: number;
  period: {
    id: string | null;
    state: string;
    closedAt: string | null;
    reopenedAt: string | null;
    reopenReason: string | null;
  };
  snapshots: {
    version: number;
    computedAt: string;
    revenueCents: string;
    opexCents: string;
    ebitdaCents: string;
    marginBps: number;
  }[];
  source: 'live' | 'snapshot';
}

/**
 * Serviço de fechamento e DRE/EBITDA (prompt mestre §18, §19).
 *
 * Políticas desta primeira fatia:
 *
 *   Receita: sum(BillingMeasurement.amountCents) para contratos cuja
 *            LegalEntity casa com a do fechamento, filtrada pela
 *            competência (year, month).
 *
 *   Opex: sum(PayableInvoice.amountCents) do tenant onde issuedAt está
 *         na competência. Primeira iteração não separa por LegalEntity
 *         (payables ainda não têm esse campo); aparece em DRE como
 *         "opex consolidado" — documentado em IMPLEMENTATION_STATUS.
 *
 *   EBITDA: Revenue - Opex. Sem depreciação/amortização/juros/IR
 *           (continua abaixo do EBITDA nas iterações futuras).
 *
 *   Margem: basis points (100 = 1%). 0 quando receita = 0.
 *
 * Invariantes:
 *   - Fechar período cria EBITDASnapshot imutável (unique periodId,version).
 *   - Reabrir NUNCA altera snapshots passados; cria nova versão quando
 *     fechar de novo.
 *   - `ensurePeriodOpen` é chamado pelo BillingService antes de criar
 *     uma medição. Período CLOSED → 409.
 */
@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async ensurePeriodOpenFromCtx(
    ctx: { tenantId: string },
    legalEntityId: string,
    year: number,
    month: number,
  ): Promise<void> {
    await this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const period = await tx.accountingPeriod.findUnique({
        where: {
          tenantId_legalEntityId_year_month: {
            tenantId: ctx.tenantId,
            legalEntityId,
            year,
            month,
          },
        },
      });
      if (period && period.state === 'CLOSED') {
        throw new ConflictException(
          `competência ${year}-${String(month).padStart(2, '0')} está CLOSED — reabra antes de registrar fatos`,
        );
      }
    });
  }

  /**
   * Variante que opera numa transação recebida; usada por serviços
   * downstream que já estão dentro de uma `withTenantFromCtx`.
   */
  async ensurePeriodOpenInTx(
    tx: PrismaClient,
    tenantId: string,
    legalEntityId: string,
    year: number,
    month: number,
  ): Promise<void> {
    const period = await tx.accountingPeriod.findUnique({
      where: {
        tenantId_legalEntityId_year_month: {
          tenantId,
          legalEntityId,
          year,
          month,
        },
      },
    });
    if (period && period.state === 'CLOSED') {
      throw new ConflictException(
        `competência ${year}-${String(month).padStart(2, '0')} está CLOSED — reabra antes de registrar fatos`,
      );
    }
  }

  async dre(
    ctx: { tenantId: string },
    legalEntityId: string,
    year: number,
    month: number,
  ): Promise<DRE> {
    this.validateYearMonth(year, month);
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const period = await tx.accountingPeriod.findUnique({
        where: {
          tenantId_legalEntityId_year_month: {
            tenantId: ctx.tenantId,
            legalEntityId,
            year,
            month,
          },
        },
        include: { snapshots: { orderBy: { version: 'desc' } } },
      });

      // Se o período está CLOSED, usa o snapshot mais recente (imutável).
      if (period && period.state === 'CLOSED' && period.snapshots[0]) {
        const snap = period.snapshots[0];
        return {
          legalEntityId,
          year,
          month,
          currency: snap.currency,
          revenueCents: snap.revenueCents.toString(),
          opexCents: snap.opexCents.toString(),
          ebitdaCents: snap.ebitdaCents.toString(),
          marginBps: snap.marginBps,
          period: {
            id: period.id,
            state: period.state,
            closedAt: period.closedAt ? period.closedAt.toISOString() : null,
            reopenedAt: period.reopenedAt ? period.reopenedAt.toISOString() : null,
            reopenReason: period.reopenReason,
          },
          snapshots: period.snapshots.map((s) => ({
            version: s.version,
            computedAt: s.computedAt.toISOString(),
            revenueCents: s.revenueCents.toString(),
            opexCents: s.opexCents.toString(),
            ebitdaCents: s.ebitdaCents.toString(),
            marginBps: s.marginBps,
          })),
          source: 'snapshot',
        };
      }

      // Caso contrário: computa ao vivo.
      const live = await this.computeLive(tx, ctx.tenantId, legalEntityId, year, month);
      return {
        legalEntityId,
        year,
        month,
        currency: 'BRL',
        revenueCents: live.revenueCents.toString(),
        opexCents: live.opexCents.toString(),
        ebitdaCents: live.ebitdaCents.toString(),
        marginBps: live.marginBps,
        period: {
          id: period?.id ?? null,
          state: period?.state ?? 'OPEN',
          closedAt: period?.closedAt ? period.closedAt.toISOString() : null,
          reopenedAt: period?.reopenedAt ? period.reopenedAt.toISOString() : null,
          reopenReason: period?.reopenReason ?? null,
        },
        snapshots:
          period?.snapshots.map((s) => ({
            version: s.version,
            computedAt: s.computedAt.toISOString(),
            revenueCents: s.revenueCents.toString(),
            opexCents: s.opexCents.toString(),
            ebitdaCents: s.ebitdaCents.toString(),
            marginBps: s.marginBps,
          })) ?? [],
        source: 'live',
      };
    });
  }

  async close(
    ctx: { tenantId: string; userId: string },
    legalEntityId: string,
    year: number,
    month: number,
  ): Promise<DRE> {
    this.validateYearMonth(year, month);
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const existing = await tx.accountingPeriod.findUnique({
        where: {
          tenantId_legalEntityId_year_month: {
            tenantId: ctx.tenantId,
            legalEntityId,
            year,
            month,
          },
        },
        include: { snapshots: true },
      });
      if (existing && existing.state === 'CLOSED') {
        throw new ConflictException(`período ${year}-${String(month).padStart(2, '0')} já está CLOSED`);
      }

      const live = await this.computeLive(tx, ctx.tenantId, legalEntityId, year, month);
      const closedAt = new Date();

      const period = await tx.accountingPeriod.upsert({
        where: {
          tenantId_legalEntityId_year_month: {
            tenantId: ctx.tenantId,
            legalEntityId,
            year,
            month,
          },
        },
        update: {
          state: 'CLOSED',
          closedAt,
          closedBy: ctx.userId,
        },
        create: {
          tenantId: ctx.tenantId,
          legalEntityId,
          year,
          month,
          state: 'CLOSED',
          closedAt,
          closedBy: ctx.userId,
        },
      });

      const nextVersion = (existing?.snapshots.length ?? 0) + 1;
      await tx.eBITDASnapshot.create({
        data: {
          tenantId: ctx.tenantId,
          legalEntityId,
          periodId: period.id,
          version: nextVersion,
          year,
          month,
          revenueCents: live.revenueCents,
          opexCents: live.opexCents,
          ebitdaCents: live.ebitdaCents,
          marginBps: live.marginBps,
          currency: 'BRL',
          computedBy: ctx.userId,
        },
      });

      await this.audit.recordInTx(tx, ctx, {
        action: 'finance.period.close',
        subjectType: 'AccountingPeriod',
        subjectId: period.id,
        subjectVersion: nextVersion,
        after: {
          state: 'CLOSED',
          legalEntityId,
          year,
          month,
          snapshotVersion: nextVersion,
          revenueCents: live.revenueCents,
          opexCents: live.opexCents,
          ebitdaCents: live.ebitdaCents,
          marginBps: live.marginBps,
        },
      });

      return this.loadDreInTx(tx, ctx.tenantId, legalEntityId, year, month);
    });
  }

  async reopen(
    ctx: { tenantId: string; userId: string },
    legalEntityId: string,
    year: number,
    month: number,
    reason: string,
  ): Promise<DRE> {
    if (!reason || reason.trim().length < 3) {
      throw new BadRequestException('reason obrigatório (mín. 3 caracteres)');
    }
    this.validateYearMonth(year, month);
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const period = await tx.accountingPeriod.findUnique({
        where: {
          tenantId_legalEntityId_year_month: {
            tenantId: ctx.tenantId,
            legalEntityId,
            year,
            month,
          },
        },
      });
      if (!period) throw new NotFoundException('período não encontrado');
      if (period.state !== 'CLOSED') {
        throw new ConflictException(`só períodos CLOSED podem ser reabertos (atual: ${period.state})`);
      }
      await tx.accountingPeriod.update({
        where: { id: period.id },
        data: {
          state: 'REOPENED',
          reopenedAt: new Date(),
          reopenedBy: ctx.userId,
          reopenReason: reason.trim(),
        },
      });
      await this.audit.recordInTx(tx, ctx, {
        action: 'finance.period.reopen',
        subjectType: 'AccountingPeriod',
        subjectId: period.id,
        reason: reason.trim(),
        before: { state: 'CLOSED' },
        after: { state: 'REOPENED', year, month, legalEntityId },
      });
      return this.loadDreInTx(tx, ctx.tenantId, legalEntityId, year, month);
    });
  }

  /**
   * Monta o DRE dentro de uma transação já aberta (sem reentrância do
   * $transaction do Prisma, que não enxerga writes da outer tx).
   */
  private async loadDreInTx(
    tx: PrismaClient,
    tenantId: string,
    legalEntityId: string,
    year: number,
    month: number,
  ): Promise<DRE> {
    const period = await tx.accountingPeriod.findUnique({
      where: {
        tenantId_legalEntityId_year_month: {
          tenantId,
          legalEntityId,
          year,
          month,
        },
      },
      include: { snapshots: { orderBy: { version: 'desc' } } },
    });

    if (period && period.state === 'CLOSED' && period.snapshots[0]) {
      const snap = period.snapshots[0];
      return {
        legalEntityId,
        year,
        month,
        currency: snap.currency,
        revenueCents: snap.revenueCents.toString(),
        opexCents: snap.opexCents.toString(),
        ebitdaCents: snap.ebitdaCents.toString(),
        marginBps: snap.marginBps,
        period: {
          id: period.id,
          state: period.state,
          closedAt: period.closedAt ? period.closedAt.toISOString() : null,
          reopenedAt: period.reopenedAt ? period.reopenedAt.toISOString() : null,
          reopenReason: period.reopenReason,
        },
        snapshots: period.snapshots.map((s) => ({
          version: s.version,
          computedAt: s.computedAt.toISOString(),
          revenueCents: s.revenueCents.toString(),
          opexCents: s.opexCents.toString(),
          ebitdaCents: s.ebitdaCents.toString(),
          marginBps: s.marginBps,
        })),
        source: 'snapshot',
      };
    }

    const live = await this.computeLive(tx, tenantId, legalEntityId, year, month);
    return {
      legalEntityId,
      year,
      month,
      currency: 'BRL',
      revenueCents: live.revenueCents.toString(),
      opexCents: live.opexCents.toString(),
      ebitdaCents: live.ebitdaCents.toString(),
      marginBps: live.marginBps,
      period: {
        id: period?.id ?? null,
        state: period?.state ?? 'OPEN',
        closedAt: period?.closedAt ? period.closedAt.toISOString() : null,
        reopenedAt: period?.reopenedAt ? period.reopenedAt.toISOString() : null,
        reopenReason: period?.reopenReason ?? null,
      },
      snapshots:
        period?.snapshots.map((s) => ({
          version: s.version,
          computedAt: s.computedAt.toISOString(),
          revenueCents: s.revenueCents.toString(),
          opexCents: s.opexCents.toString(),
          ebitdaCents: s.ebitdaCents.toString(),
          marginBps: s.marginBps,
        })) ?? [],
      source: 'live',
    };
  }

  // --------------------------------------------------------------------------

  private async computeLive(
    tx: PrismaClient,
    tenantId: string,
    legalEntityId: string,
    year: number,
    month: number,
  ): Promise<{
    revenueCents: bigint;
    opexCents: bigint;
    ebitdaCents: bigint;
    marginBps: number;
  }> {
    void tenantId; // escopo já garantido pela transação RLS

    // Receita: medições com contratos desta pessoa jurídica + competência.
    const measurementRows = await tx.billingMeasurement.findMany({
      where: {
        competenceYear: year,
        competenceMonth: month,
        contract: { legalEntityId },
      },
      select: { amountCents: true },
    });
    const revenueCents = measurementRows.reduce((acc, m) => acc + m.amountCents, 0n);

    // Opex: payables com issuedAt na competência (iteração 1 — consolidado
    // por tenant; separação por LegalEntity vem com GL completo).
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 1));
    const payableRows = await tx.payableInvoice.findMany({
      where: {
        issuedAt: { gte: monthStart, lt: monthEnd },
        status: { not: 'CANCELLED' },
      },
      select: { amountCents: true },
    });
    const opexCents = payableRows.reduce((acc, p) => acc + p.amountCents, 0n);

    const ebitdaCents = revenueCents - opexCents;
    const marginBps =
      revenueCents === 0n
        ? 0
        : Number((ebitdaCents * 10_000n) / revenueCents);

    return { revenueCents, opexCents, ebitdaCents, marginBps };
  }

  private validateYearMonth(year: number, month: number): void {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new BadRequestException('ano inválido');
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException('mês inválido (1..12)');
    }
  }
}
