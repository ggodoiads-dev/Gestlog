import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ctx: { tenantId: string }): Promise<{
    items: {
      id: string;
      legalName: string;
      tradeName: string | null;
      cnpj: string | null;
      status: string;
    }[];
  }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const items = await tx.client.findMany({
        orderBy: { legalName: 'asc' },
        select: { id: true, legalName: true, tradeName: true, cnpj: true, status: true },
      });
      return { items };
    });
  }

  async findById(
    ctx: { tenantId: string },
    id: string,
  ): Promise<{
    id: string;
    legalName: string;
    tradeName: string | null;
    cnpj: string | null;
  } | null> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      return tx.client.findUnique({
        where: { id },
        select: { id: true, legalName: true, tradeName: true, cnpj: true },
      });
    });
  }
}
