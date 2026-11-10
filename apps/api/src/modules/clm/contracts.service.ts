import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaClient, BillingKind } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * AT-21: devolve o preço vigente do contrato para uma competência
   * (year, month). Se existir ContractAdjustment com effectiveFrom <= último
   * dia da competência, usa o preço mais recente aplicável; senão, o
   * preço "original" do contrato.
   */
  async effectivePricingInTx(
    tx: PrismaClient,
    contract: {
      id: string;
      pricingMode: BillingKind | null;
      pricingAmountCents: bigint | null;
      pricingCurrency: string;
    },
    year: number,
    month: number,
  ): Promise<{
    pricingMode: BillingKind | null;
    pricingAmountCents: bigint | null;
    currency: string;
    source: 'adjustment' | 'original';
    adjustmentId: string | null;
  }> {
    const endOfMonth = new Date(Date.UTC(year, month, 0));
    const adj = await tx.contractAdjustment.findFirst({
      where: { contractId: contract.id, effectiveFrom: { lte: endOfMonth } },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (adj) {
      return {
        pricingMode: adj.newPricingMode,
        pricingAmountCents: adj.newPricingAmountCents,
        currency: adj.currency,
        source: 'adjustment',
        adjustmentId: adj.id,
      };
    }
    return {
      pricingMode: contract.pricingMode,
      pricingAmountCents: contract.pricingAmountCents,
      currency: contract.pricingCurrency,
      source: 'original',
      adjustmentId: null,
    };
  }

  async adjust(
    ctx: { tenantId: string; userId: string },
    contractId: string,
    dto: {
      effectiveFrom: string;
      newPricingMode: BillingKind;
      newPricingAmountCents: number;
      reason: string;
      currency?: string;
    },
  ): Promise<{
    id: string;
    effectiveFrom: string;
    oldPricingAmountCents: string | null;
    newPricingAmountCents: string;
  }> {
    if (!dto.reason || dto.reason.trim().length < 5) {
      throw new BadRequestException('reason obrigatório (≥ 5 caracteres)');
    }
    if (!dto.effectiveFrom) {
      throw new BadRequestException('effectiveFrom obrigatório');
    }
    const effective = new Date(dto.effectiveFrom);
    if (Number.isNaN(effective.getTime())) {
      throw new BadRequestException('effectiveFrom inválido');
    }

    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const contract = await tx.contract.findUnique({ where: { id: contractId } });
      if (!contract) throw new NotFoundException('contrato não encontrado');

      // Preço vigente ANTES deste adjustment (para guardar como old_*).
      const lastBefore = await tx.contractAdjustment.findFirst({
        where: { contractId, effectiveFrom: { lt: effective } },
        orderBy: { effectiveFrom: 'desc' },
      });
      const oldMode = lastBefore?.newPricingMode ?? contract.pricingMode;
      const oldAmount = lastBefore?.newPricingAmountCents ?? contract.pricingAmountCents;

      try {
        const row = await tx.contractAdjustment.create({
          data: {
            tenantId: ctx.tenantId,
            contractId,
            effectiveFrom: effective,
            ...(oldMode ? { oldPricingMode: oldMode } : {}),
            ...(oldAmount !== null ? { oldPricingAmountCents: oldAmount } : {}),
            newPricingMode: dto.newPricingMode,
            newPricingAmountCents: BigInt(dto.newPricingAmountCents),
            currency: dto.currency ?? contract.pricingCurrency,
            reason: dto.reason,
            decidedBy: ctx.userId,
          },
        });

        await this.audit.recordInTx(tx, ctx, {
          action: 'clm.contract.adjust',
          subjectType: 'Contract',
          subjectId: contractId,
          reason: dto.reason,
          before: {
            pricingMode: oldMode,
            pricingAmountCents: oldAmount?.toString() ?? null,
          },
          after: {
            effectiveFrom: dto.effectiveFrom,
            pricingMode: dto.newPricingMode,
            pricingAmountCents: dto.newPricingAmountCents.toString(),
          },
        });

        return {
          id: row.id,
          effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
          oldPricingAmountCents: oldAmount?.toString() ?? null,
          newPricingAmountCents: row.newPricingAmountCents.toString(),
        };
      } catch (err) {
        const code =
          typeof err === 'object' && err !== null && 'code' in err
            ? (err as { code?: string }).code
            : undefined;
        if (code === 'P2002') {
          throw new ConflictException(
            'já existe reajuste com essa effectiveFrom neste contrato',
          );
        }
        throw err;
      }
    });
  }

  async listAdjustments(
    ctx: { tenantId: string },
    contractId: string,
  ): Promise<{
    items: {
      id: string;
      effectiveFrom: string;
      oldPricingAmountCents: string | null;
      newPricingAmountCents: string;
      reason: string;
    }[];
  }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const rows = await tx.contractAdjustment.findMany({
        where: { contractId },
        orderBy: { effectiveFrom: 'desc' },
      });
      return {
        items: rows.map((a) => ({
          id: a.id,
          effectiveFrom: a.effectiveFrom.toISOString().slice(0, 10),
          oldPricingAmountCents: a.oldPricingAmountCents?.toString() ?? null,
          newPricingAmountCents: a.newPricingAmountCents.toString(),
          reason: a.reason,
        })),
      };
    });
  }

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
