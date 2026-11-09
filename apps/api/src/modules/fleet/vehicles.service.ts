import { ConflictException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { EligibilityService } from './eligibility.service';
import type { CreateVehicleDto } from './fleet.dto';

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibility: EligibilityService,
  ) {}

  async list(ctx: { tenantId: string }): Promise<{
    items: {
      id: string;
      internalCode: string;
      licensePlate: string;
      category: string;
      operationalStatus: string;
      isEligible: boolean;
      reasons: unknown;
    }[];
  }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const rows = await tx.vehicle.findMany({
        orderBy: { internalCode: 'asc' },
        include: { eligibility: true },
      });
      return {
        items: rows.map((v) => ({
          id: v.id,
          internalCode: v.internalCode,
          licensePlate: v.licensePlate,
          category: v.category,
          operationalStatus: v.operationalStatus,
          isEligible: v.eligibility?.isEligible ?? false,
          reasons: v.eligibility?.reasons ?? [],
        })),
      };
    });
  }

  async create(
    ctx: { tenantId: string; userId: string },
    dto: CreateVehicleDto,
  ): Promise<{ id: string; internalCode: string; licensePlate: string }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      try {
        const vehicle = await tx.vehicle.create({
          data: {
            tenantId: ctx.tenantId,
            internalCode: dto.internalCode,
            licensePlate: dto.licensePlate,
            ...(dto.chassis !== undefined ? { chassis: dto.chassis } : {}),
            ...(dto.renavam !== undefined ? { renavam: dto.renavam } : {}),
            category: dto.category,
            ...(dto.seats !== undefined ? { seats: dto.seats } : {}),
            ...(dto.modelName !== undefined ? { modelName: dto.modelName } : {}),
            ...(dto.modelYear !== undefined ? { modelYear: dto.modelYear } : {}),
            ...(dto.garageId !== undefined ? { garageId: dto.garageId } : {}),
          },
        });

        // Projeção de elegibilidade inicial (fase inicial: documentos +
        // manutenção virão em iterações seguintes).
        await this.eligibility.recomputeInTx(tx, ctx.tenantId, vehicle.id);

        return {
          id: vehicle.id,
          internalCode: vehicle.internalCode,
          licensePlate: vehicle.licensePlate,
        };
      } catch (err) {
        if (err instanceof Error && err.message.includes('Unique')) {
          throw new ConflictException('código interno ou placa já existem no tenant');
        }
        throw err;
      }
    });
  }
}
