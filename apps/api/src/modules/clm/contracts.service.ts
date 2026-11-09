import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

interface ContractRow {
  id: string;
  code: string;
  title: string;
  status: string;
  clientId: string;
  clientName: string;
  legalEntityId: string;
  pricingMode: string | null;
  pricingAmountCents: string | null;
  pricingCurrency: string;
  startDate: string | null;
  endDate: string | null;
}

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ctx: { tenantId: string }): Promise<{ items: ContractRow[] }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const rows = await tx.contract.findMany({
        orderBy: { code: 'asc' },
        include: { client: true },
      });
      return {
        items: rows.map((c) => this.toRow(c)),
      };
    });
  }

  async detail(ctx: { tenantId: string }, id: string): Promise<ContractRow | null> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const c = await tx.contract.findUnique({
        where: { id },
        include: { client: true },
      });
      return c ? this.toRow(c) : null;
    });
  }

  private toRow(c: {
    id: string;
    code: string;
    title: string;
    status: string;
    clientId: string;
    client: { legalName: string };
    legalEntityId: string;
    pricingMode: string | null;
    pricingAmountCents: bigint | null;
    pricingCurrency: string;
    startDate: Date | null;
    endDate: Date | null;
  }): ContractRow {
    return {
      id: c.id,
      code: c.code,
      title: c.title,
      status: c.status,
      clientId: c.clientId,
      clientName: c.client.legalName,
      legalEntityId: c.legalEntityId,
      pricingMode: c.pricingMode,
      pricingAmountCents: c.pricingAmountCents !== null ? c.pricingAmountCents.toString() : null,
      pricingCurrency: c.pricingCurrency,
      startDate: c.startDate ? c.startDate.toISOString().slice(0, 10) : null,
      endDate: c.endDate ? c.endDate.toISOString().slice(0, 10) : null,
    };
  }
}
