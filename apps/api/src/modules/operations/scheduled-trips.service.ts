import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

interface ExpandOpts {
  fromDate: string; // YYYY-MM-DD
  toDate: string;   // YYYY-MM-DD
}

/**
 * Serviço de domínio que expande a `RouteVersion` vigente em uma janela
 * de datas, criando `ScheduledTrip` para cada turno + dia-da-semana
 * permitido.
 *
 * Idempotente: usa `upsert` sobre a chave única
 * (routeVersionId, routeTurnId, operationalDate). Rodar duas vezes com
 * a mesma janela não duplica viagens.
 *
 * REGRA DE OURO: nunca reescreve viagens já existentes. Se o usuário
 * publicar uma NOVA versão de rota, as viagens antigas permanecem
 * amarradas à versão antiga. Novas viagens expandidas depois da
 * publicação da v2 usarão a v2.
 */
@Injectable()
export class ScheduledTripsService {
  constructor(private readonly prisma: PrismaService) {}

  async expandForRoute(
    ctx: { tenantId: string },
    routeId: string,
    opts: ExpandOpts,
  ): Promise<{ created: number; skipped: number; routeVersionId: string }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const version = await this.pickActiveVersion(tx, routeId, opts.fromDate);
      if (!version) {
        throw new NotFoundException('rota sem versão publicada vigente na janela');
      }
      return this.expandInTx(tx, ctx.tenantId, version.id, opts);
    });
  }

  async listByDate(
    ctx: { tenantId: string },
    date: string,
  ): Promise<{
    items: {
      id: string;
      routeCode: string;
      routeVersion: number;
      turnLabel: string;
      plannedDeparture: Date;
      plannedArrival: Date;
      state: string;
    }[];
  }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const operationalDate = new Date(`${date}T00:00:00Z`);
      const rows = await tx.scheduledTrip.findMany({
        where: { operationalDate },
        orderBy: [{ plannedDeparture: 'asc' }],
        include: {
          routeVersion: {
            include: {
              route: true,
              turns: true,
            },
          },
        },
      });
      return {
        items: rows.map((t) => {
          const turn = t.routeVersion.turns.find((tr) => tr.id === t.routeTurnId);
          return {
            id: t.id,
            routeCode: t.routeVersion.route.code,
            routeVersion: t.routeVersion.version,
            turnLabel: turn?.label ?? '?',
            plannedDeparture: t.plannedDeparture,
            plannedArrival: t.plannedArrival,
            state: t.state,
          };
        }),
      };
    });
  }

  private async pickActiveVersion(
    tx: PrismaClient,
    routeId: string,
    date: string,
  ): Promise<{ id: string } | null> {
    const target = new Date(`${date}T00:00:00Z`);
    const v = await tx.routeVersion.findFirst({
      where: {
        routeId,
        publishedAt: { not: null },
        effectiveFrom: { lte: target },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: target } }],
      },
      orderBy: { version: 'desc' },
      select: { id: true },
    });
    return v;
  }

  private async expandInTx(
    tx: PrismaClient,
    tenantId: string,
    routeVersionId: string,
    opts: ExpandOpts,
  ): Promise<{ created: number; skipped: number; routeVersionId: string }> {
    const from = new Date(`${opts.fromDate}T00:00:00Z`);
    const to = new Date(`${opts.toDate}T00:00:00Z`);
    if (to < from) {
      throw new BadRequestException('toDate < fromDate');
    }
    const version = await tx.routeVersion.findUnique({
      where: { id: routeVersionId },
      include: { turns: true, stops: { orderBy: { sequence: 'asc' } } },
    });
    if (!version) throw new NotFoundException('versão não encontrada');
    if (!version.publishedAt) {
      throw new BadRequestException('não é possível expandir versão não publicada');
    }

    const stopOffsets = version.stops.map((s) => s.offsetMinutes);
    const firstOffset = Math.min(...stopOffsets);
    const lastOffset = Math.max(...stopOffsets);

    let created = 0;
    let skipped = 0;

    for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
      const dowIso = ((d.getUTCDay() + 6) % 7) + 1; // 1=Seg...7=Dom
      for (const turn of version.turns) {
        if (!turn.daysOfWeek.includes(dowIso)) continue;

        const parts = turn.targetArrivalTime.split(':').map(Number);
        const hh = parts[0] ?? 0;
        const mm = parts[1] ?? 0;
        const arrival = new Date(d);
        arrival.setUTCHours(hh, mm, 0, 0);
        // offset dos stops é relativo ao início do turno (negativo = antes).
        const departure = new Date(arrival.getTime() + firstOffset * 60_000);
        const lastStop = new Date(arrival.getTime() + lastOffset * 60_000);

        const operationalDate = new Date(
          Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
        );
        const existing = await tx.scheduledTrip.findUnique({
          where: {
            routeVersionId_routeTurnId_operationalDate: {
              routeVersionId: version.id,
              routeTurnId: turn.id,
              operationalDate,
            },
          },
        });
        if (existing) {
          skipped += 1;
          continue;
        }
        await tx.scheduledTrip.create({
          data: {
            tenantId,
            routeVersionId: version.id,
            routeTurnId: turn.id,
            operationalDate,
            plannedDeparture: departure,
            plannedArrival: lastStop > arrival ? lastStop : arrival,
            state: 'PLANNED',
          },
        });
        created += 1;
      }
    }
    return { created, skipped, routeVersionId: version.id };
  }
}
