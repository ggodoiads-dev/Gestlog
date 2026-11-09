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
  CreateTankDto,
  RegisterFillDto,
  RegisterPurchaseDto,
  RegisterTransferDto,
} from './fuel.dto';

/**
 * Serviço de combustível.
 *
 * Decisões de modelagem:
 *   - Volume em mililitros (BigInt) → aritmética exata com 3 casas.
 *   - Custo em centavos (BigInt).
 *   - Saldo do tanque computado ao vivo (volume de demo é pequeno; em
 *     produção isso vira projeção materializada).
 *
 * Regras atendidas:
 *   - AT-13: compra e abastecimento são operações independentes. O extrato
 *     do tanque lista cada uma com seu tipo, não confunde saldo com giro.
 *   - AT-14: compra emergencial acima do limite nasce PENDING_APPROVAL e
 *     NÃO entra no saldo até ser aprovada por quem tem alçada.
 *   - AT-15: transferência entre tanques é operação atômica dupla; conserva
 *     o volume total da garagem.
 */

const DEFAULT_EMERGENCY_THRESHOLD_CENTS = BigInt(
  process.env.FUEL_EMERGENCY_THRESHOLD_CENTS ?? '100000', // R$ 1.000
);

@Injectable()
export class FuelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createTank(
    ctx: { tenantId: string; userId: string },
    dto: CreateTankDto,
  ): Promise<{ id: string; code: string; name: string; product: string }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      try {
        const row = await tx.fuelTank.create({
          data: {
            tenantId: ctx.tenantId,
            code: dto.code,
            name: dto.name,
            product: dto.product,
            capacityMl: BigInt(dto.capacityMl),
            ...(dto.garageId ? { garageId: dto.garageId } : {}),
          },
        });
        return { id: row.id, code: row.code, name: row.name, product: row.product };
      } catch (err) {
        const code =
          typeof err === 'object' && err !== null && 'code' in err
            ? (err as { code?: string }).code
            : undefined;
        if (code === 'P2002') {
          throw new ConflictException('código do tanque já em uso neste tenant');
        }
        throw err;
      }
    });
  }

  async listTanks(ctx: { tenantId: string }): Promise<{
    items: {
      id: string;
      code: string;
      name: string;
      product: string;
      capacityMl: string;
      balanceMl: string;
      pendingPurchases: number;
    }[];
  }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const tanks = await tx.fuelTank.findMany({
        where: { active: true },
        orderBy: { code: 'asc' },
      });
      const items = [];
      for (const t of tanks) {
        const bal = await this.balanceInTx(tx, t.id);
        const pending = await tx.fuelPurchase.count({
          where: { tankId: t.id, status: 'PENDING_APPROVAL' },
        });
        items.push({
          id: t.id,
          code: t.code,
          name: t.name,
          product: t.product,
          capacityMl: t.capacityMl.toString(),
          balanceMl: bal.toString(),
          pendingPurchases: pending,
        });
      }
      return { items };
    });
  }

  private async balanceInTx(tx: PrismaClient, tankId: string): Promise<bigint> {
    // Soma compras CONFIRMED + transferências entrando - abastecimentos - transferências saindo.
    const [confirmedPurchases, transfersIn, fills, transfersOut] = await Promise.all([
      tx.fuelPurchase.aggregate({
        _sum: { quantityMl: true },
        where: { tankId, status: 'CONFIRMED' },
      }),
      tx.fuelTransfer.aggregate({
        _sum: { quantityMl: true },
        where: { toTankId: tankId },
      }),
      tx.fuelFill.aggregate({
        _sum: { quantityMl: true },
        where: { tankId },
      }),
      tx.fuelTransfer.aggregate({
        _sum: { quantityMl: true },
        where: { fromTankId: tankId },
      }),
    ]);
    const confirmed = confirmedPurchases._sum.quantityMl ?? 0n;
    const tin = transfersIn._sum.quantityMl ?? 0n;
    const filled = fills._sum.quantityMl ?? 0n;
    const tout = transfersOut._sum.quantityMl ?? 0n;
    return confirmed + tin - filled - tout;
  }

  async registerPurchase(
    ctx: { tenantId: string; userId: string },
    tankId: string,
    dto: RegisterPurchaseDto,
  ): Promise<{
    id: string;
    status: string;
    emergency: boolean;
    quantityMl: string;
    totalCostCents: string;
  }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const tank = await tx.fuelTank.findUnique({ where: { id: tankId } });
      if (!tank) throw new NotFoundException('tanque não encontrado');

      const totalCost = BigInt(dto.totalCostCents);
      const emergency = dto.emergency ?? false;

      // AT-14: emergencial + acima do limite → PENDING_APPROVAL.
      // Compra ordinária acima do limite exige aprovação prévia (fluxo via
      // Governance.ApprovalRequest, fora do escopo desta fatia), então aqui
      // tratamos apenas o caminho emergencial. Compra ordinária acima do
      // limite é REJEITADA com 403 — não há atalho.
      let status: 'PENDING_APPROVAL' | 'CONFIRMED' = 'CONFIRMED';
      const overThreshold = totalCost > DEFAULT_EMERGENCY_THRESHOLD_CENTS;
      if (overThreshold && !emergency) {
        throw new ForbiddenException(
          `compra acima do limite (R$ ${(Number(DEFAULT_EMERGENCY_THRESHOLD_CENTS) / 100).toFixed(2)}) exige aprovação prévia via governança — ou marque como emergency=true`,
        );
      }
      if (overThreshold && emergency) {
        if (!dto.reason || dto.reason.trim().length < 3) {
          throw new BadRequestException(
            'compra emergencial exige reason com no mínimo 3 caracteres',
          );
        }
        status = 'PENDING_APPROVAL';
      }

      const row = await tx.fuelPurchase.create({
        data: {
          tenantId: ctx.tenantId,
          tankId,
          supplierName: dto.supplierName,
          ...(dto.supplierCnpj !== undefined ? { supplierCnpj: dto.supplierCnpj } : {}),
          ...(dto.invoiceNumber !== undefined ? { invoiceNumber: dto.invoiceNumber } : {}),
          quantityMl: BigInt(dto.quantityMl),
          totalCostCents: totalCost,
          purchasedAt: new Date(dto.purchasedAt),
          status,
          emergency,
          ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
          requestedBy: ctx.userId,
        },
      });

      await this.audit.recordInTx(tx, ctx, {
        action:
          status === 'CONFIRMED' ? 'fuel.purchase.confirm' : 'fuel.purchase.request',
        subjectType: 'FuelPurchase',
        subjectId: row.id,
        ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
        after: {
          tankId,
          quantityMl: dto.quantityMl,
          totalCostCents: dto.totalCostCents,
          emergency,
          status,
        },
      });

      return {
        id: row.id,
        status: row.status,
        emergency: row.emergency,
        quantityMl: row.quantityMl.toString(),
        totalCostCents: row.totalCostCents.toString(),
      };
    });
  }

  async approvePurchase(
    ctx: { tenantId: string; userId: string },
    purchaseId: string,
  ): Promise<{ id: string; status: string }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const p = await tx.fuelPurchase.findUnique({ where: { id: purchaseId } });
      if (!p) throw new NotFoundException('compra não encontrada');
      if (p.status !== 'PENDING_APPROVAL') {
        throw new ConflictException(
          `compra ${p.status.toLowerCase()} — não aceita nova aprovação`,
        );
      }
      // SoD: quem pediu não aprova. Reusa invariante do AT-03.
      if (p.requestedBy === ctx.userId) {
        throw new ForbiddenException('autoaprovação proibida: quem pediu não decide');
      }
      const updated = await tx.fuelPurchase.update({
        where: { id: purchaseId },
        data: {
          status: 'CONFIRMED',
          approvedBy: ctx.userId,
          approvedAt: new Date(),
        },
      });
      await this.audit.recordInTx(tx, ctx, {
        action: 'fuel.purchase.approve',
        subjectType: 'FuelPurchase',
        subjectId: purchaseId,
        before: { status: 'PENDING_APPROVAL' },
        after: { status: 'CONFIRMED' },
      });
      return { id: updated.id, status: updated.status };
    });
  }

  async rejectPurchase(
    ctx: { tenantId: string; userId: string },
    purchaseId: string,
    reason: string,
  ): Promise<{ id: string; status: string }> {
    if (!reason || reason.trim().length < 3) {
      throw new BadRequestException('reason obrigatório');
    }
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const p = await tx.fuelPurchase.findUnique({ where: { id: purchaseId } });
      if (!p) throw new NotFoundException('compra não encontrada');
      if (p.status !== 'PENDING_APPROVAL') {
        throw new ConflictException(`compra ${p.status.toLowerCase()} — não aceita rejeição`);
      }
      if (p.requestedBy === ctx.userId) {
        throw new ForbiddenException('autorrejeição proibida');
      }
      const updated = await tx.fuelPurchase.update({
        where: { id: purchaseId },
        data: {
          status: 'REJECTED',
          approvedBy: ctx.userId,
          approvedAt: new Date(),
          reason,
        },
      });
      await this.audit.recordInTx(tx, ctx, {
        action: 'fuel.purchase.reject',
        subjectType: 'FuelPurchase',
        subjectId: purchaseId,
        reason,
        before: { status: 'PENDING_APPROVAL' },
        after: { status: 'REJECTED' },
      });
      return { id: updated.id, status: updated.status };
    });
  }

  async registerFill(
    ctx: { tenantId: string; userId: string },
    tankId: string,
    dto: RegisterFillDto,
  ): Promise<{ id: string; quantityMl: string; tankBalanceMl: string }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const tank = await tx.fuelTank.findUnique({ where: { id: tankId } });
      if (!tank) throw new NotFoundException('tanque não encontrado');

      const quantity = BigInt(dto.quantityMl);
      const current = await this.balanceInTx(tx, tankId);
      if (quantity > current) {
        throw new ConflictException(
          `tanque sem saldo: disponível ${current.toString()} ml, pedido ${quantity.toString()} ml`,
        );
      }

      const fill = await tx.fuelFill.create({
        data: {
          tenantId: ctx.tenantId,
          tankId,
          vehicleId: dto.vehicleId,
          ...(dto.driverId !== undefined ? { driverId: dto.driverId } : {}),
          quantityMl: quantity,
          ...(dto.odometerKm !== undefined ? { odometerKm: dto.odometerKm } : {}),
          filledAt: new Date(dto.filledAt),
          ...(dto.reference !== undefined ? { reference: dto.reference } : {}),
        },
      });

      const newBalance = current - quantity;
      await this.audit.recordInTx(tx, ctx, {
        action: 'fuel.fill.register',
        subjectType: 'FuelFill',
        subjectId: fill.id,
        after: {
          tankId,
          vehicleId: dto.vehicleId,
          quantityMl: dto.quantityMl,
          tankBalanceAfter: newBalance.toString(),
        },
      });

      return {
        id: fill.id,
        quantityMl: fill.quantityMl.toString(),
        tankBalanceMl: newBalance.toString(),
      };
    });
  }

  async transfer(
    ctx: { tenantId: string; userId: string },
    dto: RegisterTransferDto,
  ): Promise<{
    id: string;
    fromBalanceMl: string;
    toBalanceMl: string;
  }> {
    if (dto.fromTankId === dto.toTankId) {
      throw new BadRequestException('fromTankId e toTankId devem ser diferentes');
    }
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const [from, to] = await Promise.all([
        tx.fuelTank.findUnique({ where: { id: dto.fromTankId } }),
        tx.fuelTank.findUnique({ where: { id: dto.toTankId } }),
      ]);
      if (!from || !to) throw new NotFoundException('tanque não encontrado');
      if (from.product !== to.product) {
        throw new ConflictException(
          `produtos incompatíveis: ${from.product} → ${to.product}`,
        );
      }
      const quantity = BigInt(dto.quantityMl);
      const fromBalance = await this.balanceInTx(tx, dto.fromTankId);
      if (quantity > fromBalance) {
        throw new ConflictException(
          `tanque de origem sem saldo: disponível ${fromBalance.toString()} ml`,
        );
      }

      const row = await tx.fuelTransfer.create({
        data: {
          tenantId: ctx.tenantId,
          fromTankId: dto.fromTankId,
          toTankId: dto.toTankId,
          quantityMl: quantity,
          transferredAt: new Date(dto.transferredAt),
          ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
          createdBy: ctx.userId,
        },
      });

      const [newFrom, newTo] = await Promise.all([
        this.balanceInTx(tx, dto.fromTankId),
        this.balanceInTx(tx, dto.toTankId),
      ]);

      await this.audit.recordInTx(tx, ctx, {
        action: 'fuel.transfer.register',
        subjectType: 'FuelTransfer',
        subjectId: row.id,
        ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
        after: {
          fromTankId: dto.fromTankId,
          toTankId: dto.toTankId,
          quantityMl: dto.quantityMl,
          fromBalanceAfter: newFrom.toString(),
          toBalanceAfter: newTo.toString(),
        },
      });

      return {
        id: row.id,
        fromBalanceMl: newFrom.toString(),
        toBalanceMl: newTo.toString(),
      };
    });
  }

  async tankStatement(ctx: { tenantId: string }, tankId: string): Promise<{
    tank: { id: string; code: string; name: string; product: string; balanceMl: string };
    entries: {
      kind: 'PURCHASE' | 'FILL' | 'TRANSFER_IN' | 'TRANSFER_OUT';
      at: string;
      quantityMl: string;
      label: string;
      status?: string;
    }[];
  }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const tank = await tx.fuelTank.findUnique({ where: { id: tankId } });
      if (!tank) throw new NotFoundException('tanque não encontrado');
      const [purchases, fills, trIn, trOut, balance] = await Promise.all([
        tx.fuelPurchase.findMany({
          where: { tankId },
          orderBy: { purchasedAt: 'desc' },
          take: 100,
        }),
        tx.fuelFill.findMany({
          where: { tankId },
          orderBy: { filledAt: 'desc' },
          take: 100,
        }),
        tx.fuelTransfer.findMany({
          where: { toTankId: tankId },
          orderBy: { transferredAt: 'desc' },
          take: 100,
        }),
        tx.fuelTransfer.findMany({
          where: { fromTankId: tankId },
          orderBy: { transferredAt: 'desc' },
          take: 100,
        }),
        this.balanceInTx(tx, tankId),
      ]);
      const entries: {
        kind: 'PURCHASE' | 'FILL' | 'TRANSFER_IN' | 'TRANSFER_OUT';
        at: string;
        quantityMl: string;
        label: string;
        status?: string;
      }[] = [];
      for (const p of purchases) {
        entries.push({
          kind: 'PURCHASE',
          at: p.purchasedAt.toISOString(),
          quantityMl: p.quantityMl.toString(),
          label: `${p.supplierName}${p.invoiceNumber ? ` · NF ${p.invoiceNumber}` : ''}${p.emergency ? ' · emergencial' : ''}`,
          status: p.status,
        });
      }
      for (const f of fills) {
        entries.push({
          kind: 'FILL',
          at: f.filledAt.toISOString(),
          quantityMl: f.quantityMl.toString(),
          label: `veículo ${f.vehicleId.slice(0, 8)}…${f.odometerKm !== null ? ` · ${f.odometerKm} km` : ''}`,
        });
      }
      for (const t of trIn) {
        entries.push({
          kind: 'TRANSFER_IN',
          at: t.transferredAt.toISOString(),
          quantityMl: t.quantityMl.toString(),
          label: `← tanque ${t.fromTankId.slice(0, 8)}…`,
        });
      }
      for (const t of trOut) {
        entries.push({
          kind: 'TRANSFER_OUT',
          at: t.transferredAt.toISOString(),
          quantityMl: t.quantityMl.toString(),
          label: `→ tanque ${t.toTankId.slice(0, 8)}…`,
        });
      }
      entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
      return {
        tank: {
          id: tank.id,
          code: tank.code,
          name: tank.name,
          product: tank.product,
          balanceMl: balance.toString(),
        },
        entries,
      };
    });
  }
}
