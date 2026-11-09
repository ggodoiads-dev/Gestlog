import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

interface CreateOrderInput {
  legalEntityId: string;
  code: string;
  supplierName: string;
  supplierCnpj?: string | undefined;
  description: string;
  amountCents: bigint;
  currency?: string | undefined;
  approvalId?: string | undefined;
}

interface ReceiveInput {
  amountCents: bigint;
  receivedAt: Date;
  reference?: string;
}

/**
 * Serviço de pedidos de compra.
 *
 * Invariantes (AT-16):
 *   - `sum(receipts) <= order.amountCents` SEMPRE.
 *   - `invoicedCents <= receivedCents` SEMPRE (3-way match grosseiro).
 *   - Estado: OPEN → PARTIALLY_RECEIVED → RECEIVED.
 *   - CANCELLED só se não houve recebimento.
 *   - `approvalId` liga o pedido a um ApprovalRequest APROVADO (serviço
 *     valida o estado no momento da criação — sem aprovação, sem pedido).
 */
@Injectable()
export class PurchaseOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    ctx: { tenantId: string; userId: string },
    input: CreateOrderInput,
  ): Promise<{ id: string; code: string; status: string }> {
    if (input.amountCents <= 0n) {
      throw new BadRequestException('amountCents deve ser positivo');
    }

    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      if (input.approvalId) {
        const approval = await tx.approvalRequest.findUnique({
          where: { id: input.approvalId },
        });
        if (!approval) throw new NotFoundException('approvalId não encontrado');
        if (approval.state !== 'APPROVED') {
          throw new ConflictException(
            `aprovação vinculada está ${approval.state.toLowerCase()} — pedido não pode ser criado`,
          );
        }
      }

      try {
        const order = await tx.purchaseOrder.create({
          data: {
            tenantId: ctx.tenantId,
            legalEntityId: input.legalEntityId,
            code: input.code,
            supplierName: input.supplierName,
            ...(input.supplierCnpj !== undefined ? { supplierCnpj: input.supplierCnpj } : {}),
            description: input.description,
            amountCents: input.amountCents,
            currency: input.currency ?? 'BRL',
            createdBy: ctx.userId,
            ...(input.approvalId !== undefined ? { approvalId: input.approvalId } : {}),
          },
        });
        return { id: order.id, code: order.code, status: order.status };
      } catch (err) {
        const code =
          typeof err === 'object' && err !== null && 'code' in err
            ? (err as { code?: string }).code
            : undefined;
        if (code === 'P2002') {
          throw new ConflictException(`código ${input.code} já existe no tenant`);
        }
        throw err;
      }
    });
  }

  async receive(
    ctx: { tenantId: string; userId: string },
    orderId: string,
    input: ReceiveInput,
  ): Promise<{
    receiptId: string;
    order: {
      id: string;
      amountCents: string;
      receivedCents: string;
      remainingCents: string;
      status: string;
    };
  }> {
    if (input.amountCents <= 0n) {
      throw new BadRequestException('amountCents deve ser positivo');
    }
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const order = await tx.purchaseOrder.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException('pedido não encontrado');
      if (order.status === 'CANCELLED') {
        throw new ConflictException('pedido cancelado não aceita recebimento');
      }
      const remaining = order.amountCents - order.receivedCents;
      if (input.amountCents > remaining) {
        throw new ConflictException(
          `overreceive: restante é ${remaining.toString()} centavos; tentativa ${input.amountCents.toString()}`,
        );
      }

      const receipt = await tx.goodsReceipt.create({
        data: {
          tenantId: ctx.tenantId,
          orderId,
          amountCents: input.amountCents,
          receivedAt: input.receivedAt,
          receivedBy: ctx.userId,
          ...(input.reference !== undefined ? { reference: input.reference } : {}),
        },
      });

      const newReceived = order.receivedCents + input.amountCents;
      const isFullyReceived = newReceived === order.amountCents;
      const updated = await tx.purchaseOrder.update({
        where: { id: orderId },
        data: {
          receivedCents: newReceived,
          status: isFullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED',
        },
      });

      return {
        receiptId: receipt.id,
        order: {
          id: updated.id,
          amountCents: updated.amountCents.toString(),
          receivedCents: updated.receivedCents.toString(),
          remainingCents: (updated.amountCents - updated.receivedCents).toString(),
          status: updated.status,
        },
      };
    });
  }

  async detail(
    ctx: { tenantId: string },
    orderId: string,
  ): Promise<{
    id: string;
    code: string;
    status: string;
    supplierName: string;
    supplierCnpj: string | null;
    description: string;
    amountCents: string;
    receivedCents: string;
    invoicedCents: string;
    remainingCents: string;
    currency: string;
    approvalId: string | null;
    receipts: { id: string; amountCents: string; receivedAt: string; reference: string | null }[];
  } | null> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const o = await tx.purchaseOrder.findUnique({
        where: { id: orderId },
        include: { receipts: { orderBy: { receivedAt: 'asc' } } },
      });
      if (!o) return null;
      return {
        id: o.id,
        code: o.code,
        status: o.status,
        supplierName: o.supplierName,
        supplierCnpj: o.supplierCnpj,
        description: o.description,
        amountCents: o.amountCents.toString(),
        receivedCents: o.receivedCents.toString(),
        invoicedCents: o.invoicedCents.toString(),
        remainingCents: (o.amountCents - o.receivedCents).toString(),
        currency: o.currency,
        approvalId: o.approvalId,
        receipts: o.receipts.map((r) => ({
          id: r.id,
          amountCents: r.amountCents.toString(),
          receivedAt: r.receivedAt.toISOString(),
          reference: r.reference,
        })),
      };
    });
  }

  async list(ctx: { tenantId: string }) {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const rows = await tx.purchaseOrder.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
      return {
        items: rows.map((o) => ({
          id: o.id,
          code: o.code,
          supplierName: o.supplierName,
          description: o.description,
          amountCents: o.amountCents.toString(),
          receivedCents: o.receivedCents.toString(),
          invoicedCents: o.invoicedCents.toString(),
          remainingCents: (o.amountCents - o.receivedCents).toString(),
          currency: o.currency,
          status: o.status,
        })),
      };
    });
  }
}
