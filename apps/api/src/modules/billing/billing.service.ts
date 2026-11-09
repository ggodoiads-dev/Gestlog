import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { FinanceService } from '../finance/finance.service';

interface ValidatedTripResult {
  tripId: string;
  measurementId: string;
  measurementKind: 'MONTHLY_FIXED' | 'PER_TRIP';
  wasAlreadyValidated: boolean;
  monthlyFixedReused: boolean;
}

interface PreInvoiceItem {
  measurementId: string;
  kind: 'MONTHLY_FIXED' | 'PER_TRIP';
  quantity: string;
  unitPriceCents: string;
  amountCents: string;
  scheduledTripId: string | null;
}

interface PreInvoice {
  contractId: string;
  contractCode: string;
  competence: string; // YYYY-MM
  totalAmountCents: string;
  currency: string;
  items: PreInvoiceItem[];
}

/**
 * Serviço de medição contratual. Núcleo do registro canônico #1.
 *
 * Fluxo da invariante AT-20 (contrato mensal fixo):
 *
 *   Trip 1 validada em novembro  → cria measurement MONTHLY_FIXED
 *                                    (contract, 2026, 11, qty=1, amount=18.000,00)
 *   Trip 2 validada em novembro  → unique index parcial impede duplicar;
 *                                    service retorna measurement existente
 *   Trip 3 validada em dezembro  → cria measurement separado (dezembro)
 *
 * Fluxo contratos PER_TRIP:
 *
 *   Cada trip validada cria exatamente UMA measurement
 *   (unique index em scheduled_trip_id); replay é idempotente.
 *
 * O serviço NÃO decide se a viagem foi executada corretamente — isso é
 * `TripExecution.validated = true`. Aqui só traduzimos viagem validada
 * em medição elegível.
 */
@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
  ) {}

  async validateAndMeasure(
    ctx: { tenantId: string; userId: string },
    scheduledTripId: string,
  ): Promise<ValidatedTripResult> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const trip = await tx.scheduledTrip.findUnique({
        where: { id: scheduledTripId },
        include: {
          execution: true,
          routeVersion: {
            include: {
              route: {
                include: { contract: true },
              },
            },
          },
        },
      });
      if (!trip) throw new NotFoundException('viagem programada não encontrada');
      if (trip.state === 'CANCELLED') {
        throw new ConflictException('viagem cancelada não pode gerar medição');
      }
      const contract = trip.routeVersion.route.contract;
      if (!contract.pricingMode || contract.pricingAmountCents === null) {
        throw new BadRequestException(
          `contrato ${contract.code} não tem preço configurado (pricingMode/pricingAmountCents)`,
        );
      }

      const wasAlreadyValidated = trip.execution?.validated === true;

      // Competência da viagem. Se o período já foi fechado, bloqueia ANTES
      // de criar qualquer fato — prompt mestre §18 (fechamento imutável).
      const competenceYear = trip.operationalDate.getUTCFullYear();
      const competenceMonth = trip.operationalDate.getUTCMonth() + 1;
      await this.finance.ensurePeriodOpenInTx(
        tx,
        ctx.tenantId,
        contract.legalEntityId,
        competenceYear,
        competenceMonth,
      );

      // Garante TripExecution + marca como validada (idempotente).
      const execution = await tx.tripExecution.upsert({
        where: { scheduledTripId },
        update: wasAlreadyValidated
          ? {}
          : { validated: true, validatedAt: new Date(), validatedBy: ctx.userId },
        create: {
          tenantId: ctx.tenantId,
          scheduledTripId,
          state: 'NOT_STARTED',
          validated: true,
          validatedAt: new Date(),
          validatedBy: ctx.userId,
        },
      });
      void execution;

      // Gera medição conforme pricingMode.
      if (contract.pricingMode === 'PER_TRIP') {
        const measurement = await this.upsertPerTripMeasurement(
          tx,
          ctx.tenantId,
          contract.id,
          scheduledTripId,
          competenceYear,
          competenceMonth,
          contract.pricingAmountCents,
          contract.pricingCurrency,
        );
        return {
          tripId: scheduledTripId,
          measurementId: measurement.id,
          measurementKind: 'PER_TRIP',
          wasAlreadyValidated,
          monthlyFixedReused: false,
        };
      }

      // MONTHLY_FIXED — uma única measurement por competência.
      const result = await this.upsertMonthlyFixedMeasurement(
        tx,
        ctx.tenantId,
        contract.id,
        competenceYear,
        competenceMonth,
        contract.pricingAmountCents,
        contract.pricingCurrency,
      );
      return {
        tripId: scheduledTripId,
        measurementId: result.id,
        measurementKind: 'MONTHLY_FIXED',
        wasAlreadyValidated,
        monthlyFixedReused: !result.created,
      };
    });
  }

  async preInvoice(
    ctx: { tenantId: string },
    contractId: string,
    competenceYear: number,
    competenceMonth: number,
  ): Promise<PreInvoice> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const contract = await tx.contract.findUnique({ where: { id: contractId } });
      if (!contract) throw new NotFoundException('contrato não encontrado');
      const items = await tx.billingMeasurement.findMany({
        where: {
          contractId,
          competenceYear,
          competenceMonth,
        },
        orderBy: { createdAt: 'asc' },
      });
      const totalCents = items.reduce((acc, m) => acc + m.amountCents, 0n);
      return {
        contractId,
        contractCode: contract.code,
        competence: `${competenceYear}-${String(competenceMonth).padStart(2, '0')}`,
        totalAmountCents: totalCents.toString(),
        currency: items[0]?.currency ?? contract.pricingCurrency,
        items: items.map((m) => ({
          measurementId: m.id,
          kind: m.kind as 'MONTHLY_FIXED' | 'PER_TRIP',
          quantity: m.quantity.toString(),
          unitPriceCents: m.unitPriceCents.toString(),
          amountCents: m.amountCents.toString(),
          scheduledTripId: m.scheduledTripId,
        })),
      };
    });
  }

  // --------------------------------------------------------------------------
  // Helpers privados
  // --------------------------------------------------------------------------

  private async upsertPerTripMeasurement(
    tx: PrismaClient,
    tenantId: string,
    contractId: string,
    scheduledTripId: string,
    competenceYear: number,
    competenceMonth: number,
    priceCents: bigint,
    currency: string,
  ): Promise<{ id: string }> {
    const existing = await tx.billingMeasurement.findFirst({
      where: { scheduledTripId, kind: 'PER_TRIP' },
      select: { id: true },
    });
    if (existing) return existing;
    try {
      return await tx.billingMeasurement.create({
        data: {
          tenantId,
          contractId,
          scheduledTripId,
          kind: 'PER_TRIP',
          competenceYear,
          competenceMonth,
          quantity: '1',
          unitPriceCents: priceCents,
          amountCents: priceCents,
          currency,
        },
        select: { id: true },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const retry = await tx.billingMeasurement.findFirstOrThrow({
          where: { scheduledTripId, kind: 'PER_TRIP' },
          select: { id: true },
        });
        return retry;
      }
      throw err;
    }
  }

  private async upsertMonthlyFixedMeasurement(
    tx: PrismaClient,
    tenantId: string,
    contractId: string,
    competenceYear: number,
    competenceMonth: number,
    priceCents: bigint,
    currency: string,
  ): Promise<{ id: string; created: boolean }> {
    const existing = await tx.billingMeasurement.findFirst({
      where: { contractId, kind: 'MONTHLY_FIXED', competenceYear, competenceMonth },
      select: { id: true },
    });
    if (existing) return { id: existing.id, created: false };
    try {
      const created = await tx.billingMeasurement.create({
        data: {
          tenantId,
          contractId,
          kind: 'MONTHLY_FIXED',
          competenceYear,
          competenceMonth,
          quantity: '1',
          unitPriceCents: priceCents,
          amountCents: priceCents,
          currency,
        },
        select: { id: true },
      });
      return { id: created.id, created: true };
    } catch (err) {
      if (isUniqueViolation(err)) {
        const retry = await tx.billingMeasurement.findFirstOrThrow({
          where: { contractId, kind: 'MONTHLY_FIXED', competenceYear, competenceMonth },
          select: { id: true },
        });
        return { id: retry.id, created: false };
      }
      throw err;
    }
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'P2002'
  );
}
