import { Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

/**
 * Serviço de compliance trabalhista para designação de motoristas.
 *
 * Fatia atual (AT-04): jornada do motorista.
 *
 * Regras aplicadas:
 *   - Jornada diária: máximo 10h de direção no mesmo dia-calendário UTC
 *     (Lei do Motorista 13.103/2015).
 *   - Jornada semanal: máximo 44h em janela deslizante de 7 dias
 *     terminando no fim da designação proposta (CLT art. 58).
 *
 * As durações são computadas a partir da janela planejada da ScheduledTrip
 * (plannedDeparture → plannedArrival). AT-05 (intervalo interjornada) e
 * AT-06 (exclusividade de veículo) ficam em fatias próprias e reusam este
 * serviço como ponto único de verificação.
 *
 * Importante: o guard NÃO altera dados. Ele retorna um resultado estruturado
 * para que o chamador escolha como reagir (bloquear, avisar, auditar).
 */

export const JOURNEY_DAILY_LIMIT_HOURS = 10;
export const JOURNEY_WEEKLY_LIMIT_HOURS = 44;

const EPS = 1e-6;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

export interface JourneyCheckInput {
  driverId: string;
  startAt: Date;
  endAt: Date;
  excludeAssignmentId?: string;
}

export type JourneyViolationCode = 'JOURNEY_DAILY_LIMIT' | 'JOURNEY_WEEKLY_LIMIT';

export interface JourneyViolation {
  code: JourneyViolationCode;
  limitHours: number;
  actualHours: number;
  windowStart: string;
  windowEnd: string;
}

export interface ComplianceResult {
  ok: boolean;
  violations: JourneyViolation[];
}

function hoursBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / MS_PER_HOUR;
}

function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class ComplianceService {
  async checkJourneyInTx(
    tx: PrismaClient,
    tenantId: string,
    input: JourneyCheckInput,
  ): Promise<ComplianceResult> {
    if (input.endAt.getTime() <= input.startAt.getTime()) {
      // Janela inválida — devolve ok=false explícito em vez de deixar aritmética negativa.
      return {
        ok: false,
        violations: [
          {
            code: 'JOURNEY_DAILY_LIMIT',
            limitHours: JOURNEY_DAILY_LIMIT_HOURS,
            actualHours: 0,
            windowStart: input.startAt.toISOString(),
            windowEnd: input.endAt.toISOString(),
          },
        ],
      };
    }

    const proposedHours = hoursBetween(input.startAt, input.endAt);

    // Janela de 7 dias terminando no fim da designação proposta. Pegamos
    // qualquer trip "vivo" do motorista que sobreponha essa janela — cobre
    // os dois checks (dia e semana) com uma consulta só.
    const weekStart = new Date(input.endAt.getTime() - 7 * MS_PER_DAY);

    const existing = await tx.assignment.findMany({
      where: {
        tenantId,
        driverId: input.driverId,
        state: { notIn: ['CANCELLED', 'SUPERSEDED'] },
        ...(input.excludeAssignmentId ? { id: { not: input.excludeAssignmentId } } : {}),
        scheduledTrip: {
          plannedDeparture: { lt: input.endAt },
          plannedArrival: { gt: weekStart },
        },
      },
      select: {
        id: true,
        scheduledTrip: {
          select: { plannedDeparture: true, plannedArrival: true },
        },
      },
    });

    // Daily: mesmo dia-calendário UTC que o início proposto.
    const dayStart = utcDayStart(input.startAt);
    const dayEnd = new Date(dayStart.getTime() + MS_PER_DAY);

    const dailyHours =
      existing
        .filter(
          (a) =>
            a.scheduledTrip.plannedDeparture >= dayStart &&
            a.scheduledTrip.plannedDeparture < dayEnd,
        )
        .reduce(
          (sum, a) =>
            sum + hoursBetween(a.scheduledTrip.plannedDeparture, a.scheduledTrip.plannedArrival),
          0,
        ) +
      (input.startAt >= dayStart && input.startAt < dayEnd ? proposedHours : 0);

    // Weekly: janela deslizante de 7 dias (todos os `existing` já estão dentro).
    const weeklyHours =
      existing.reduce(
        (sum, a) =>
          sum + hoursBetween(a.scheduledTrip.plannedDeparture, a.scheduledTrip.plannedArrival),
        0,
      ) + proposedHours;

    const violations: JourneyViolation[] = [];
    if (dailyHours > JOURNEY_DAILY_LIMIT_HOURS + EPS) {
      violations.push({
        code: 'JOURNEY_DAILY_LIMIT',
        limitHours: JOURNEY_DAILY_LIMIT_HOURS,
        actualHours: round2(dailyHours),
        windowStart: dayStart.toISOString(),
        windowEnd: dayEnd.toISOString(),
      });
    }
    if (weeklyHours > JOURNEY_WEEKLY_LIMIT_HOURS + EPS) {
      violations.push({
        code: 'JOURNEY_WEEKLY_LIMIT',
        limitHours: JOURNEY_WEEKLY_LIMIT_HOURS,
        actualHours: round2(weeklyHours),
        windowStart: weekStart.toISOString(),
        windowEnd: input.endAt.toISOString(),
      });
    }

    return { ok: violations.length === 0, violations };
  }
}
