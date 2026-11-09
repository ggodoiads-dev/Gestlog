import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

interface CreatePayableInput {
  orderId?: string | undefined;
  supplierName: string;
  supplierCnpj?: string | undefined;
  description: string;
  amountCents: bigint;
  dueDate: Date;
  paymentApprovalId?: string | undefined;
}

interface PayInput {
  payableId: string;
  idempotencyKey: string;
  amountCents: bigint;
  method: 'MANUAL' | 'BANK_API' | 'PIX' | 'OFX_IMPORT';
  externalStatus?: 'CONFIRMED' | 'PROCESSING' | 'UNKNOWN';
  paidAt: Date;
  reference?: string;
}

/**
 * Serviço de contas a pagar (AT-16, §27 do prompt mestre).
 *
 * Invariantes:
 *   - Payable novo exige order totalmente recebido OU valor <= receivedCents
 *     do order (3-way match grosseiro; conferência fina virá com a camada
 *     3-way completa).
 *   - Payment com `externalStatus=UNKNOWN` NÃO atualiza paidCents nem
 *     fecha o título. Fica como fato registrado para investigação; reenviar
 *     NÃO cria segundo débito (unique idempotencyKey).
 *   - Payment CONFIRMED atualiza paidCents, seta status PAID quando
 *     cobre o saldo, e marca paidAt.
 *   - Overpayment (soma > saldo) → 409.
 *   - Replay com mesma Idempotency-Key → retorna o pagamento original.
 */
@Injectable()
export class PayablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createPayable(
    ctx: { tenantId: string; userId: string },
    input: CreatePayableInput,
  ): Promise<{ id: string; amountCents: string; dueDate: string; status: string }> {
    if (input.amountCents <= 0n) {
      throw new BadRequestException('amountCents deve ser positivo');
    }
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      if (input.orderId) {
        const order = await tx.purchaseOrder.findUnique({ where: { id: input.orderId } });
        if (!order) throw new NotFoundException('pedido não encontrado');
        if (order.status === 'CANCELLED') {
          throw new ConflictException('pedido cancelado não aceita faturamento');
        }
        const availableToInvoice = order.receivedCents - order.invoicedCents;
        if (input.amountCents > availableToInvoice) {
          throw new ConflictException(
            `3-way: nao ha saldo recebido para faturar. disponivel=${availableToInvoice.toString()}`,
          );
        }
      }

      const payable = await tx.payableInvoice.create({
        data: {
          tenantId: ctx.tenantId,
          ...(input.orderId !== undefined ? { orderId: input.orderId } : {}),
          supplierName: input.supplierName,
          ...(input.supplierCnpj !== undefined ? { supplierCnpj: input.supplierCnpj } : {}),
          description: input.description,
          amountCents: input.amountCents,
          dueDate: input.dueDate,
          ...(input.paymentApprovalId !== undefined
            ? { paymentApprovalId: input.paymentApprovalId }
            : {}),
        },
      });

      if (input.orderId) {
        await tx.purchaseOrder.update({
          where: { id: input.orderId },
          data: { invoicedCents: { increment: input.amountCents } },
        });
      }

      return {
        id: payable.id,
        amountCents: payable.amountCents.toString(),
        dueDate: payable.dueDate.toISOString().slice(0, 10),
        status: payable.status,
      };
    });
  }

  async pay(
    ctx: { tenantId: string; userId: string },
    input: PayInput,
  ): Promise<{
    paymentId: string;
    externalStatus: string;
    payable: {
      amountCents: string;
      paidCents: string;
      balanceCents: string;
      status: string;
      paidAt: string | null;
    };
    wasDeduped: boolean;
  }> {
    if (!input.idempotencyKey || input.idempotencyKey.length < 16) {
      throw new BadRequestException('Idempotency-Key obrigatória (mín. 16 caracteres)');
    }
    if (input.amountCents <= 0n) {
      throw new BadRequestException('amountCents deve ser positivo');
    }

    // Dedupe upfront.
    const existing = await this.prisma.withTenantFromCtx(ctx, async (tx) =>
      tx.payment.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId: ctx.tenantId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        include: { allocations: { include: { payable: true } } },
      }),
    );
    if (existing) {
      const alloc = existing.allocations.find((a) => a.payableId === input.payableId);
      if (!alloc) {
        throw new ConflictException('Idempotency-Key usada para outro payable');
      }
      return this.toResult(
        existing.id,
        existing.externalStatus,
        alloc.payable,
        true,
      );
    }

    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const payable = await tx.payableInvoice.findUnique({
        where: { id: input.payableId },
      });
      if (!payable) throw new NotFoundException('payable não encontrado');
      if (payable.status === 'PAID' || payable.status === 'CANCELLED') {
        throw new ConflictException(`payable ${payable.status.toLowerCase()}`);
      }
      const balance = payable.amountCents - payable.paidCents;
      if (input.amountCents > balance) {
        throw new ConflictException(
          `overpayment: saldo ${balance.toString()}, tentativa ${input.amountCents.toString()}`,
        );
      }

      let payment;
      try {
        payment = await tx.payment.create({
          data: {
            tenantId: ctx.tenantId,
            idempotencyKey: input.idempotencyKey,
            method: input.method,
            externalStatus: input.externalStatus ?? 'CONFIRMED',
            paidAt: input.paidAt,
            amountCents: input.amountCents,
            currency: payable.currency,
            createdBy: ctx.userId,
            ...(input.reference !== undefined ? { reference: input.reference } : {}),
          },
        });
      } catch (err) {
        const code =
          typeof err === 'object' && err !== null && 'code' in err
            ? (err as { code?: string }).code
            : undefined;
        if (code === 'P2002') {
          throw new ConflictException('Idempotency-Key duplicada em corrida');
        }
        throw err;
      }

      await tx.paymentAllocation.create({
        data: {
          tenantId: ctx.tenantId,
          paymentId: payment.id,
          payableId: payable.id,
          amountCents: input.amountCents,
        },
      });

      // CRÍTICO (§27 do prompt): só CONFIRMED atualiza o saldo e fecha
      // o título. UNKNOWN/PROCESSING ficam como fatos, não alteram a
      // visão financeira oficial. REJECTED também não altera.
      const externalStatus = input.externalStatus ?? 'CONFIRMED';
      if (externalStatus === 'CONFIRMED') {
        const newPaid = payable.paidCents + input.amountCents;
        const isFullyPaid = newPaid === payable.amountCents;
        const updated = await tx.payableInvoice.update({
          where: { id: payable.id },
          data: {
            paidCents: newPaid,
            status: isFullyPaid ? 'PAID' : 'PARTIALLY_PAID',
            ...(isFullyPaid ? { paidAt: input.paidAt } : {}),
          },
        });
        await this.audit.recordInTx(tx, ctx, {
          action: 'ap.payable.pay',
          subjectType: 'PayableInvoice',
          subjectId: payable.id,
          before: {
            status: payable.status,
            paidCents: payable.paidCents.toString(),
          },
          after: {
            status: updated.status,
            paidCents: updated.paidCents.toString(),
            paymentId: payment.id,
            amountCents: input.amountCents.toString(),
            externalStatus: 'CONFIRMED',
          },
        });
        return this.toResult(payment.id, payment.externalStatus, updated, false);
      }
      await this.audit.recordInTx(tx, ctx, {
        action: 'ap.payable.pay.fact',
        subjectType: 'PayableInvoice',
        subjectId: payable.id,
        after: {
          paymentId: payment.id,
          amountCents: input.amountCents.toString(),
          externalStatus,
          note: 'status não-CONFIRMED não altera saldo',
        },
      });
      return this.toResult(payment.id, payment.externalStatus, payable, false);
    });
  }

  async detail(ctx: { tenantId: string }, id: string) {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const p = await tx.payableInvoice.findUnique({
        where: { id },
        include: {
          order: true,
          payments: {
            include: { payment: true },
            orderBy: { payment: { paidAt: 'desc' } },
          },
        },
      });
      if (!p) return null;
      return {
        id: p.id,
        orderId: p.orderId,
        orderCode: p.order?.code ?? null,
        supplierName: p.supplierName,
        supplierCnpj: p.supplierCnpj,
        description: p.description,
        amountCents: p.amountCents.toString(),
        paidCents: p.paidCents.toString(),
        balanceCents: (p.amountCents - p.paidCents).toString(),
        currency: p.currency,
        dueDate: p.dueDate.toISOString().slice(0, 10),
        status: p.status,
        issuedAt: p.issuedAt.toISOString(),
        paidAt: p.paidAt ? p.paidAt.toISOString() : null,
        payments: p.payments.map((a) => ({
          paymentId: a.paymentId,
          amountCents: a.amountCents.toString(),
          method: a.payment.method,
          externalStatus: a.payment.externalStatus,
          paidAt: a.payment.paidAt.toISOString(),
          reference: a.payment.reference,
        })),
      };
    });
  }

  async list(ctx: { tenantId: string }) {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const rows = await tx.payableInvoice.findMany({
        where: { status: { in: ['OPEN', 'PARTIALLY_PAID'] } },
        orderBy: { dueDate: 'asc' },
      });
      return {
        items: rows.map((p) => ({
          id: p.id,
          supplierName: p.supplierName,
          description: p.description,
          amountCents: p.amountCents.toString(),
          paidCents: p.paidCents.toString(),
          balanceCents: (p.amountCents - p.paidCents).toString(),
          currency: p.currency,
          dueDate: p.dueDate.toISOString().slice(0, 10),
          status: p.status,
        })),
      };
    });
  }

  private toResult(
    paymentId: string,
    externalStatus: string,
    payable: {
      amountCents: bigint;
      paidCents: bigint;
      status: string;
      paidAt: Date | null;
    },
    wasDeduped: boolean,
  ) {
    return {
      paymentId,
      externalStatus,
      payable: {
        amountCents: payable.amountCents.toString(),
        paidCents: payable.paidCents.toString(),
        balanceCents: (payable.amountCents - payable.paidCents).toString(),
        status: payable.status,
        paidAt: payable.paidAt ? payable.paidAt.toISOString() : null,
      },
      wasDeduped,
    };
  }
}
