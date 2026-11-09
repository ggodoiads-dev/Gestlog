import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

interface RegisterReceiptInput {
  receivableId: string;
  idempotencyKey: string;
  amountCents: bigint;
  receivedAt: Date;
  source: 'MANUAL' | 'BANK_OFX' | 'BANK_API' | 'PIX';
  reference?: string;
}

interface RegisterReceiptResult {
  receiptId: string;
  receivableId: string;
  allocationCents: string;
  receivable: {
    amountCents: string;
    paidCents: string;
    balanceCents: string;
    status: string;
    paidAt: string | null;
  };
  wasDeduped: boolean;
}

/**
 * Registro de pagamento (Receipt) com alocação a um Receivable.
 *
 * Invariantes:
 *   - Idempotência por `Idempotency-Key`: replay retorna o receipt original.
 *   - `sum(allocations) <= receivable.amountCents` SEMPRE. Overpayment:
 *     409. Permite parcial; quando `paid >= amount`, marca PAID + paidAt.
 *   - Pagamento em receivable terminal (PAID, WRITTEN_OFF): 409.
 *   - Moeda do receipt deve casar com a do receivable (rejeita mistura).
 *
 * Esta fatia suporta ALLOCATION 1:1 (um receipt alia a um receivable).
 * N:M (um pagamento quita vários títulos) está modelado no schema e
 * virá numa fatia seguinte.
 */
@Injectable()
export class ReceiptsService {
  constructor(private readonly prisma: PrismaService) {}

  async register(
    ctx: { tenantId: string; userId: string },
    input: RegisterReceiptInput,
  ): Promise<RegisterReceiptResult> {
    if (input.amountCents <= 0n) {
      throw new BadRequestException('valor do pagamento deve ser positivo');
    }
    if (!input.idempotencyKey || input.idempotencyKey.length < 16) {
      throw new BadRequestException(
        'header Idempotency-Key obrigatório (mín. 16 caracteres)',
      );
    }

    // 1. Dedupe upfront em transação curta.
    const existing = await this.prisma.withTenantFromCtx(ctx, async (tx) =>
      tx.receipt.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId: ctx.tenantId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        include: { allocations: { include: { receivable: true } } },
      }),
    );
    if (existing) {
      const alloc = existing.allocations.find((a) => a.receivableId === input.receivableId);
      if (!alloc) {
        throw new ConflictException(
          'Idempotency-Key já usada para outro receivable (reconciliar manualmente)',
        );
      }
      return this.toResult(
        existing.id,
        alloc.receivableId,
        alloc.amountCents,
        alloc.receivable,
        true,
      );
    }

    // 2. Insert em transação própria.
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const receivable = await tx.receivable.findUnique({
        where: { id: input.receivableId },
      });
      if (!receivable) throw new NotFoundException('receivable não encontrado');
      if (receivable.status === 'PAID' || receivable.status === 'WRITTEN_OFF') {
        throw new ConflictException(`receivable já ${receivable.status.toLowerCase()}`);
      }
      const balance = receivable.amountCents - receivable.paidCents;
      if (input.amountCents > balance) {
        throw new ConflictException(
          `overpayment: saldo é ${balance.toString()} centavos; tentativa ${input.amountCents.toString()}`,
        );
      }

      // Cria Receipt + alocação + atualiza derivados em um atomic batch.
      let receipt;
      try {
        receipt = await tx.receipt.create({
          data: {
            tenantId: ctx.tenantId,
            idempotencyKey: input.idempotencyKey,
            source: input.source,
            receivedAt: input.receivedAt,
            amountCents: input.amountCents,
            currency: receivable.currency,
            ...(input.reference !== undefined ? { reference: input.reference } : {}),
          },
        });
      } catch (err) {
        const code =
          typeof err === 'object' && err !== null && 'code' in err
            ? (err as { code?: string }).code
            : undefined;
        if (code === 'P2002') {
          throw new ConflictException(
            'Idempotency-Key duplicada em corrida — refaça para obter resultado atual',
          );
        }
        throw err;
      }

      await tx.receiptAllocation.create({
        data: {
          tenantId: ctx.tenantId,
          receiptId: receipt.id,
          receivableId: receivable.id,
          amountCents: input.amountCents,
        },
      });

      const newPaid = receivable.paidCents + input.amountCents;
      const newBalance = receivable.amountCents - newPaid;
      const isFullyPaid = newBalance === 0n;

      const updated = await tx.receivable.update({
        where: { id: receivable.id },
        data: {
          paidCents: newPaid,
          status: isFullyPaid ? 'PAID' : 'PARTIALLY_PAID',
          ...(isFullyPaid ? { paidAt: input.receivedAt } : {}),
        },
      });

      return this.toResult(receipt.id, receivable.id, input.amountCents, updated, false);
    });
  }

  private toResult(
    receiptId: string,
    receivableId: string,
    allocationCents: bigint,
    receivable: {
      amountCents: bigint;
      paidCents: bigint;
      status: string;
      paidAt: Date | null;
    },
    wasDeduped: boolean,
  ): RegisterReceiptResult {
    return {
      receiptId,
      receivableId,
      allocationCents: allocationCents.toString(),
      receivable: {
        amountCents: receivable.amountCents.toString(),
        paidCents: receivable.paidCents.toString(),
        balanceCents: (receivable.amountCents - receivable.paidCents).toString(),
        status: receivable.status,
        paidAt: receivable.paidAt ? receivable.paidAt.toISOString() : null,
      },
      wasDeduped,
    };
  }
}
