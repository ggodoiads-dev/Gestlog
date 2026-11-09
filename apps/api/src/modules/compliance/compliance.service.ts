import { Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

/**
 * Serviço de compliance trabalhista para designação de motoristas.
 *
 * Regras aplicadas:
 *   - AT-04 jornada diária: máximo 10h de direção no mesmo dia-calendário
 *     UTC (Lei do Motorista 13.103/2015).
 *   - AT-04 jornada semanal: máximo 44h em janela deslizante de 7 dias
 *     terminando no fim da designação proposta (CLT art. 58).
 *   - AT-05 descanso interjornada: no mínimo 11h de gap entre a chegada
 *     de uma designação e a saída da seguinte (mesmo motorista), em
 *     qualquer direção temporal (CLT art. 66, Lei 13.103/2015 art. 67-A).
 *
 * As durações são computadas a partir da janela planejada da ScheduledTrip
 * (plannedDeparture → plannedArrival). AT-06 (exclusividade de veículo em
 * slot) fica em fatia própria e reusa este serviço como ponto único.
 *
 * Importante: o guard NÃO altera dados. Ele retorna um resultado estruturado
 * para que o chamador escolha como reagir (bloquear, avisar, auditar).
 */

export const JOURNEY_DAILY_LIMIT_HOURS = 10;
export const JOURNEY_WEEKLY_LIMIT_HOURS = 44;
export const INTERJOURNEY_REST_MIN_HOURS = 11;

const EPS = 1e-6;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

export interface JourneyCheckInput {
  driverId: string;
  startAt: Date;
  endAt: Date;
  excludeAssignmentId?: string;
}

export type JourneyViolationCode =
  | 'JOURNEY_DAILY_LIMIT'
  | 'JOURNEY_WEEKLY_LIMIT'
  | 'INTERJOURNEY_REST';

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

    // AT-05 — descanso interjornada. Uma "jornada" aqui é o envelope
    // [min(start), max(end)] das viagens de um motorista num mesmo dia
    // UTC — várias viagens num dia formam UMA jornada com pausas
    // intrajornada (não interjornada). O gap entre jornadas de dias
    // distintos deve ser ≥ 11h.
    const allTrips = [
      ...existing.map((a) => ({
        start: a.scheduledTrip.plannedDeparture,
        end: a.scheduledTrip.plannedArrival,
      })),
      { start: input.startAt, end: input.endAt },
    ];
    const byDay = new Map<string, { start: Date; end: Date }>();
    for (const t of allTrips) {
      const key = utcDayStart(t.start).toISOString();
      const cur = byDay.get(key);
      if (!cur) {
        byDay.set(key, { start: t.start, end: t.end });
      } else {
        if (t.start < cur.start) cur.start = t.start;
        if (t.end > cur.end) cur.end = t.end;
      }
    }
    const journeys = [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map((e) => e[1]);
    // Encontramos o par consecutivo que envolve a proposta (um dos dois
    // lados é o dia do input). Se há mais de um par com gap curto, cada
    // um vira uma violação.
    for (let i = 1; i < journeys.length; i++) {
      const prev = journeys[i - 1];
      const curr = journeys[i];
      if (!prev || !curr) continue;
      const gap = hoursBetween(prev.end, curr.start);
      if (gap < INTERJOURNEY_REST_MIN_HOURS - EPS) {
        violations.push({
          code: 'INTERJOURNEY_REST',
          limitHours: INTERJOURNEY_REST_MIN_HOURS,
          actualHours: round2(gap),
          windowStart: prev.end.toISOString(),
          windowEnd: curr.start.toISOString(),
        });
      }
    }

    return { ok: violations.length === 0, violations };
  }
}
