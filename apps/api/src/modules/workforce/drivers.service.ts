import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import type { CreateDriverDto } from './workforce.dto';

@Injectable()
export class DriversService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ctx: { tenantId: string }): Promise<{
    items: {
      id: string;
      fullName: string;
      cpf: string;
      status: string;
      currentLicense: { category: string; number: string; validUntil: Date } | null;
    }[];
  }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const rows = await tx.driver.findMany({
        orderBy: { fullName: 'asc' },
        include: {
          licenses: { orderBy: { validUntil: 'desc' }, take: 1 },
        },
      });
      return {
        items: rows.map((d) => ({
          id: d.id,
          fullName: d.fullName,
          cpf: d.cpf,
          status: d.status,
          currentLicense: d.licenses[0]
            ? {
                category: d.licenses[0].category,
                number: d.licenses[0].number,
                validUntil: d.licenses[0].validUntil,
              }
            : null,
        })),
      };
    });
  }

  async create(
    ctx: { tenantId: string },
    dto: CreateDriverDto,
  ): Promise<{ id: string; fullName: string }> {
    const validUntil = new Date(`${dto.license.validUntil}T00:00:00Z`);
    const issuedAt = new Date(`${dto.license.issuedAt}T00:00:00Z`);
    if (validUntil < issuedAt) {
      throw new BadRequestException('validUntil anterior a issuedAt');
    }

    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      try {
        const driver = await tx.driver.create({
          data: {
            tenantId: ctx.tenantId,
            fullName: dto.fullName,
            cpf: dto.cpf,
            ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
            licenses: {
              create: {
                tenantId: ctx.tenantId,
                category: dto.license.category,
                number: dto.license.number,
                issuedAt,
                validUntil,
              },
            },
          },
        });
        return { id: driver.id, fullName: driver.fullName };
      } catch (err) {
        if (err instanceof Error && err.message.includes('Unique')) {
          throw new ConflictException('CPF ou número de habilitação já cadastrado no tenant');
        }
        throw err;
      }
    });
  }

  /**
   * Checa se o motorista está apto a operar em uma data dada:
   *   - status ACTIVE
   *   - ao menos uma habilitação cuja validade cobre a data E cuja categoria
   *     consta nas aceitas pelo contexto da viagem (quando fornecidas)
   *
   * Executado DENTRO da transação da designação; usa a mesma conexão
   * (RLS escopada).
   */
  async checkEligibilityInTx(
    tx: PrismaClient,
    driverId: string,
    atDate: Date,
    acceptedCategories?: readonly string[],
  ): Promise<{ eligible: true } | { eligible: false; reason: string }> {
    const driver = await tx.driver.findUnique({
      where: { id: driverId },
      include: {
        licenses: {
          where: { validUntil: { gte: atDate } },
          orderBy: { validUntil: 'desc' },
        },
      },
    });
    if (!driver) return { eligible: false, reason: 'motorista não encontrado' };
    if (driver.status !== 'ACTIVE') {
      return { eligible: false, reason: `motorista com status ${driver.status}` };
    }
    if (driver.licenses.length === 0) {
      return { eligible: false, reason: 'sem habilitação válida para a data' };
    }
    if (acceptedCategories && acceptedCategories.length > 0) {
      const match = driver.licenses.some((l) => acceptedCategories.includes(l.category));
      if (!match) {
        return {
          eligible: false,
          reason: `categoria exigida ${acceptedCategories.join('|')} não presente`,
        };
      }
    }
    return { eligible: true };
  }
}
