import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import type { CreateRouteDto, CreateRouteVersionDto } from './routing.dto';

@Injectable()
export class RoutesService {
  constructor(private readonly prisma: PrismaService) {}

  async listRoutes(ctx: { tenantId: string }): Promise<{
    items: {
      id: string;
      code: string;
      name: string;
      direction: string;
      status: string;
      contractId: string;
      activeVersion: { id: string; version: number; effectiveFrom: Date } | null;
    }[];
  }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const rows = await tx.route.findMany({
        orderBy: { code: 'asc' },
        include: {
          versions: {
            where: { publishedAt: { not: null } },
            orderBy: { version: 'desc' },
            take: 1,
          },
        },
      });
      return {
        items: rows.map((r) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          direction: r.direction,
          status: r.status,
          contractId: r.contractId,
          activeVersion:
            r.versions[0]
              ? {
                  id: r.versions[0].id,
                  version: r.versions[0].version,
                  effectiveFrom: r.versions[0].effectiveFrom,
                }
              : null,
        })),
      };
    });
  }

  async createRoute(
    ctx: { tenantId: string },
    dto: CreateRouteDto,
  ): Promise<{ id: string; code: string }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      // Contract tem que existir dentro do tenant (RLS garante isolamento).
      const contract = await tx.contract.findUnique({ where: { id: dto.contractId } });
      if (!contract) {
        throw new NotFoundException('contrato não encontrado');
      }
      try {
        const route = await tx.route.create({
          data: {
            tenantId: ctx.tenantId,
            contractId: dto.contractId,
            ...(dto.clientUnitId !== undefined ? { clientUnitId: dto.clientUnitId } : {}),
            code: dto.code,
            name: dto.name,
            direction: dto.direction,
            status: 'DRAFT',
          },
        });
        return { id: route.id, code: route.code };
      } catch (err) {
        if (err instanceof Error && err.message.includes('Unique')) {
          throw new ConflictException(`código ${dto.code} já existe no tenant`);
        }
        throw err;
      }
    });
  }

  async createDraftVersion(
    ctx: { tenantId: string; userId: string },
    routeId: string,
    dto: CreateRouteVersionDto,
  ): Promise<{ id: string; version: number }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const route = await tx.route.findUnique({
        where: { id: routeId },
        include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
      });
      if (!route) throw new NotFoundException('rota não encontrada');

      // Validações de domínio.
      const sequences = dto.stops.map((s) => s.sequence);
      const uniqueSequences = new Set(sequences);
      if (uniqueSequences.size !== sequences.length) {
        throw new BadRequestException('sequências de paradas duplicadas');
      }
      if (dto.effectiveTo && dto.effectiveTo < dto.effectiveFrom) {
        throw new BadRequestException('effectiveTo < effectiveFrom');
      }

      const nextVersion = (route.versions[0]?.version ?? 0) + 1;

      const snapshot = {
        stops: dto.stops,
        turns: dto.turns,
        targetArrivalOffsetMin: dto.targetArrivalOffsetMin,
        maxWalkMeters: dto.maxWalkMeters,
        capacityMin: dto.capacityMin ?? null,
      };

      const version = await tx.routeVersion.create({
        data: {
          tenantId: ctx.tenantId,
          routeId,
          version: nextVersion,
          effectiveFrom: new Date(`${dto.effectiveFrom}T00:00:00Z`),
          ...(dto.effectiveTo ? { effectiveTo: new Date(`${dto.effectiveTo}T00:00:00Z`) } : {}),
          targetArrivalOffsetMin: dto.targetArrivalOffsetMin,
          maxWalkMeters: dto.maxWalkMeters,
          ...(dto.capacityMin !== undefined ? { capacityMin: dto.capacityMin } : {}),
          snapshotJson: snapshot,
        },
      });

      // Materializa stops e turns relacionais para consulta eficiente.
      await tx.routeStop.createMany({
        data: dto.stops.map((s) => ({
          tenantId: ctx.tenantId,
          routeVersionId: version.id,
          sequence: s.sequence,
          name: s.name,
          ...(s.address !== undefined ? { address: s.address } : {}),
          latitude: s.latitude,
          longitude: s.longitude,
          offsetMinutes: s.offsetMinutes,
        })),
      });
      await tx.routeTurn.createMany({
        data: dto.turns.map((t) => ({
          tenantId: ctx.tenantId,
          routeVersionId: version.id,
          label: t.label,
          targetArrivalTime: t.targetArrivalTime,
          daysOfWeek: t.daysOfWeek,
        })),
      });

      return { id: version.id, version: version.version };
    });
  }

  /**
   * Publica uma versão rascunho. A versão vira imutável depois disto:
   *   - snapshot_json é congelado
   *   - stops/turns passam a ser referência oficial
   *   - publishedAt/publishedBy registram o ato
   *
   * Viagens já expandidas (ScheduledTrip) para versões ANTERIORES permanecem
   * amarradas a elas — a publicação NUNCA reescreve histórico.
   */
  async publishVersion(
    ctx: { tenantId: string; userId: string },
    versionId: string,
  ): Promise<{ id: string; version: number; publishedAt: Date }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const v = await tx.routeVersion.findUnique({
        where: { id: versionId },
        include: { route: true },
      });
      if (!v) throw new NotFoundException('versão não encontrada');
      if (v.publishedAt) {
        throw new ConflictException('versão já publicada — não pode ser alterada');
      }

      const published = await tx.routeVersion.update({
        where: { id: versionId },
        data: { publishedAt: new Date(), publishedBy: ctx.userId },
      });

      if (v.route.status === 'DRAFT' || v.route.status === 'UNDER_REVIEW') {
        await tx.route.update({ where: { id: v.routeId }, data: { status: 'ACTIVE' } });
      }

      return { id: published.id, version: published.version, publishedAt: published.publishedAt! };
    });
  }

  async getRoute(
    ctx: { tenantId: string },
    routeId: string,
  ): Promise<{
    id: string;
    code: string;
    name: string;
    direction: string;
    status: string;
    versions: { id: string; version: number; publishedAt: Date | null; effectiveFrom: Date }[];
  } | null> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const r = await tx.route.findUnique({
        where: { id: routeId },
        include: {
          versions: {
            orderBy: { version: 'desc' },
            select: { id: true, version: true, publishedAt: true, effectiveFrom: true },
          },
        },
      });
      if (!r) return null;
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        direction: r.direction,
        status: r.status,
        versions: r.versions,
      };
    });
  }
}
