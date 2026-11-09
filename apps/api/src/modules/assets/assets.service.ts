import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type {
  CreateAssetDto,
  CreateFinancingDto,
  DisposeDto,
  LifeReviewDto,
} from './assets.dto';

/**
 * Serviço de ativo imobilizado, depreciação, revisão de vida útil e
 * disposal. Cobre:
 *   - AT-29: depreciação é lançada aqui, NÃO em payables. EBITDA do
 *     Finance passa a ignorar classificações não-OPEX.
 *   - AT-30: baixar ativo com financiamento ativo exige consentimento do
 *     credor (data + documento).
 *   - AT-31: revisão de vida útil altera só depreciações FUTURAS. As
 *     COMPUTED anteriores a effectiveFrom ficam intocadas.
 *   - AT-32: CAPEX em payable_invoices NÃO entra em opex. Opcionalmente o
 *     payable carrega capitalized_asset_id.
 *
 * Método de depreciação: linha reta mensal.
 *   amount_mensal = (custo - residual) / usefulLifeMonths
 * Observação: usefulLifeMonths considerado o VIGENTE na competência,
 * calculado pelo histórico de LifeReview.
 */
@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createAsset(
    ctx: { tenantId: string; userId: string },
    dto: CreateAssetDto,
  ): Promise<{ id: string; code: string; name: string }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      try {
        const row = await tx.fixedAsset.create({
          data: {
            tenantId: ctx.tenantId,
            legalEntityId: dto.legalEntityId,
            code: dto.code,
            name: dto.name,
            category: dto.category,
            acquisitionCostCents: BigInt(dto.acquisitionCostCents),
            acquisitionDate: new Date(dto.acquisitionDate),
            residualCents: BigInt(dto.residualCents ?? 0),
            usefulLifeMonths: dto.usefulLifeMonths,
            openingAccumulatedCents: BigInt(dto.openingAccumulatedCents ?? 0),
            ...(dto.vehicleId ? { vehicleId: dto.vehicleId } : {}),
          },
        });
        await this.audit.recordInTx(tx, ctx, {
          action: 'assets.create',
          subjectType: 'FixedAsset',
          subjectId: row.id,
          after: {
            code: dto.code,
            category: dto.category,
            acquisitionCostCents: dto.acquisitionCostCents,
            usefulLifeMonths: dto.usefulLifeMonths,
          },
        });
        return { id: row.id, code: row.code, name: row.name };
      } catch (err) {
        const code =
          typeof err === 'object' && err !== null && 'code' in err
            ? (err as { code?: string }).code
            : undefined;
        if (code === 'P2002') {
          throw new ConflictException('código de ativo já em uso');
        }
        throw err;
      }
    });
  }

  async listAssets(ctx: { tenantId: string }): Promise<{
    items: {
      id: string;
      code: string;
      name: string;
      category: string;
      status: string;
      acquisitionCostCents: string;
      accumulatedDepreciationCents: string;
      netBookValueCents: string;
      hasActiveFinancing: boolean;
    }[];
  }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const assets = await tx.fixedAsset.findMany({
        orderBy: { code: 'asc' },
        include: {
          depreciations: { orderBy: { year: 'desc' }, take: 1 },
          financings: { where: { status: 'ACTIVE' } },
        },
      });
      return {
        items: assets.map((a) => {
          const latest = a.depreciations[0];
          const accumulated = (a.openingAccumulatedCents ?? 0n) + (latest?.accumulatedCents ?? 0n);
          const netBook = a.acquisitionCostCents - accumulated;
          return {
            id: a.id,
            code: a.code,
            name: a.name,
            category: a.category,
            status: a.status,
            acquisitionCostCents: a.acquisitionCostCents.toString(),
            accumulatedDepreciationCents: accumulated.toString(),
            netBookValueCents: netBook.toString(),
            hasActiveFinancing: a.financings.length > 0,
          };
        }),
      };
    });
  }

  async addFinancing(
    ctx: { tenantId: string; userId: string },
    assetId: string,
    dto: CreateFinancingDto,
  ): Promise<{ id: string; outstandingPrincipalCents: string }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const asset = await tx.fixedAsset.findUnique({ where: { id: assetId } });
      if (!asset) throw new NotFoundException('ativo não encontrado');
      const principal = BigInt(dto.originalPrincipalCents);
      const row = await tx.assetFinancing.create({
        data: {
          tenantId: ctx.tenantId,
          assetId,
          creditorName: dto.creditorName,
          ...(dto.creditorCnpj !== undefined ? { creditorCnpj: dto.creditorCnpj } : {}),
          ...(dto.contractNumber !== undefined ? { contractNumber: dto.contractNumber } : {}),
          originalPrincipalCents: principal,
          outstandingPrincipalCents: principal,
          interestRateBps: dto.interestRateBps,
          termMonths: dto.termMonths,
          startDate: new Date(dto.startDate),
        },
      });
      await this.audit.recordInTx(tx, ctx, {
        action: 'assets.financing.add',
        subjectType: 'AssetFinancing',
        subjectId: row.id,
        after: {
          assetId,
          creditorName: dto.creditorName,
          principalCents: dto.originalPrincipalCents,
          termMonths: dto.termMonths,
        },
      });
      return { id: row.id, outstandingPrincipalCents: row.outstandingPrincipalCents.toString() };
    });
  }

  /**
   * Retorna o useful_life_months vigente numa competência (AT-31).
   * - Se houver LifeReview com effective_from <= último dia da competência,
   *   usa o new_useful_life da mais recente aplicável.
   * - Senão, usa o original do ativo.
   */
  private async effectiveUsefulLifeInTx(
    tx: PrismaClient,
    asset: { id: string; usefulLifeMonths: number },
    year: number,
    month: number,
  ): Promise<number> {
    const endOfMonth = new Date(Date.UTC(year, month, 0)); // último dia
    const review = await tx.assetLifeReview.findFirst({
      where: {
        assetId: asset.id,
        effectiveFrom: { lte: endOfMonth },
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    return review?.newUsefulLifeMonths ?? asset.usefulLifeMonths;
  }

  /**
   * Calcula depreciação mensal linha-reta.
   * Idempotente por (asset, year, month) via unique index. Chamar duas
   * vezes a mesma competência não duplica (já existe → skip).
   */
  async computeMonthlyDepreciation(
    ctx: { tenantId: string; userId: string },
    year: number,
    month: number,
  ): Promise<{ computed: number; skipped: number }> {
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException('year/month inválidos');
    }
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const assets = await tx.fixedAsset.findMany({
        where: { status: 'ACTIVE' },
      });
      let computed = 0;
      let skipped = 0;
      for (const a of assets) {
        const existing = await tx.depreciationEntry.findUnique({
          where: {
            tenantId_assetId_year_month: {
              tenantId: ctx.tenantId,
              assetId: a.id,
              year,
              month,
            },
          },
        });
        if (existing) {
          skipped++;
          continue;
        }

        const life = await this.effectiveUsefulLifeInTx(tx, a, year, month);
        const depreciable = a.acquisitionCostCents - a.residualCents;
        if (depreciable <= 0n || life <= 0) {
          skipped++;
          continue;
        }

        // Soma acumulada até a competência imediatamente anterior
        const prev = await tx.depreciationEntry.findFirst({
          where: {
            assetId: a.id,
            OR: [
              { year: { lt: year } },
              { AND: [{ year }, { month: { lt: month } }] },
            ],
          },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
        });
        const prevAccumulated = (prev?.accumulatedCents ?? a.openingAccumulatedCents ?? 0n);

        // Valor mensal; cap no valor residual.
        const monthly = depreciable / BigInt(life);
        const maxRemaining = depreciable - prevAccumulated;
        if (maxRemaining <= 0n) {
          skipped++;
          continue;
        }
        const amount = monthly > maxRemaining ? maxRemaining : monthly;
        const accumulated = prevAccumulated + amount;

        await tx.depreciationEntry.create({
          data: {
            tenantId: ctx.tenantId,
            assetId: a.id,
            year,
            month,
            amountCents: amount,
            accumulatedCents: accumulated,
            usefulLifeMonthsAtCalc: life,
          },
        });
        computed++;
      }

      // Nota: não gravamos audit do batch porque subject_id é UUID; os
      // entries individuais já ficam rastreados pelo DepreciationEntry
      // (append-only efetivo: unique por asset+competência, nunca sobrescreve).
      return { computed, skipped };
    });
  }

  async addLifeReview(
    ctx: { tenantId: string; userId: string },
    assetId: string,
    dto: LifeReviewDto,
  ): Promise<{ id: string }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const asset = await tx.fixedAsset.findUnique({ where: { id: assetId } });
      if (!asset) throw new NotFoundException('ativo não encontrado');
      const effective = new Date(dto.effectiveFrom);
      if (Number.isNaN(effective.getTime())) {
        throw new BadRequestException('effectiveFrom inválido');
      }
      // Pega o vigente ANTES da revisão (para o campo oldUsefulLifeMonths)
      const last = await tx.assetLifeReview.findFirst({
        where: { assetId, effectiveFrom: { lt: effective } },
        orderBy: { effectiveFrom: 'desc' },
      });
      const oldLife = last?.newUsefulLifeMonths ?? asset.usefulLifeMonths;
      const row = await tx.assetLifeReview.create({
        data: {
          tenantId: ctx.tenantId,
          assetId,
          oldUsefulLifeMonths: oldLife,
          newUsefulLifeMonths: dto.newUsefulLifeMonths,
          effectiveFrom: effective,
          reason: dto.reason,
          decidedBy: ctx.userId,
        },
      });
      await this.audit.recordInTx(tx, ctx, {
        action: 'assets.life.review',
        subjectType: 'AssetLifeReview',
        subjectId: row.id,
        reason: dto.reason,
        before: { usefulLifeMonths: oldLife },
        after: {
          usefulLifeMonths: dto.newUsefulLifeMonths,
          effectiveFrom: dto.effectiveFrom,
        },
      });
      return { id: row.id };
    });
  }

  async dispose(
    ctx: { tenantId: string; userId: string },
    assetId: string,
    dto: DisposeDto,
  ): Promise<{ disposalId: string; status: string }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const asset = await tx.fixedAsset.findUnique({ where: { id: assetId } });
      if (!asset) throw new NotFoundException('ativo não encontrado');
      if (asset.status !== 'ACTIVE') {
        throw new ConflictException(`ativo ${asset.status.toLowerCase()} — já baixado`);
      }

      // AT-30: financiamento ativo exige consentimento do credor.
      const activeFin = await tx.assetFinancing.findFirst({
        where: { assetId, status: 'ACTIVE' },
      });
      if (activeFin && activeFin.outstandingPrincipalCents > 0n) {
        if (!dto.creditorConsentAt || !dto.creditorConsentDoc) {
          throw new ForbiddenException({
            message:
              'ativo tem financiamento ativo — informe creditorConsentAt e creditorConsentDoc',
            code: 'CREDITOR_CONSENT_REQUIRED',
            creditorName: activeFin.creditorName,
            outstandingPrincipalCents: activeFin.outstandingPrincipalCents.toString(),
          });
        }
      }

      const disposal = await tx.assetDisposal.create({
        data: {
          tenantId: ctx.tenantId,
          assetId,
          disposalKind: dto.kind,
          ...(dto.proceedsCents !== undefined
            ? { proceedsCents: BigInt(dto.proceedsCents) }
            : {}),
          disposedAt: new Date(dto.disposedAt),
          ...(dto.creditorConsentAt ? { creditorConsentAt: new Date(dto.creditorConsentAt) } : {}),
          ...(dto.creditorConsentDoc ? { creditorConsentDoc: dto.creditorConsentDoc } : {}),
          ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
          createdBy: ctx.userId,
        },
      });
      const newStatus = dto.kind === 'SALE' ? 'DISPOSED' : 'WRITE_OFF';
      await tx.fixedAsset.update({
        where: { id: assetId },
        data: {
          status: newStatus,
          disposedAt: new Date(dto.disposedAt),
          ...(dto.reason !== undefined ? { disposalReason: dto.reason } : {}),
          ...(dto.proceedsCents !== undefined
            ? { disposalProceedsCents: BigInt(dto.proceedsCents) }
            : {}),
        },
      });

      await this.audit.recordInTx(tx, ctx, {
        action: 'assets.dispose',
        subjectType: 'FixedAsset',
        subjectId: assetId,
        ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
        before: { status: 'ACTIVE' },
        after: {
          status: newStatus,
          disposalKind: dto.kind,
          disposalId: disposal.id,
          creditorConsent: Boolean(dto.creditorConsentAt),
        },
      });

      return { disposalId: disposal.id, status: newStatus };
    });
  }
}
