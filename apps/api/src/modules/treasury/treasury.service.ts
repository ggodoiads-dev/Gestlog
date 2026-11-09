import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type {
  CreateBankAccountDto,
  ImportStatementDto,
  MatchDto,
} from './treasury.dto';

/**
 * Serviço de tesouraria. Três operações compõem o ciclo:
 *   1. cadastrar BankAccount
 *   2. importar BankStatement (idempotente por externalId) — AT-18
 *   3. conciliar BankTransaction ↔ Receipt/Payment
 *
 * A reconciliação é bilateral: Receipt confirma crédito; Payment confirma
 * débito. Discrepância de valor entre o lado contábil e o bancário
 * bloqueia a conciliação até resolução manual (ajuste ou IGNORED).
 */
@Injectable()
export class TreasuryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createAccount(
    ctx: { tenantId: string; userId: string },
    dto: CreateBankAccountDto,
  ): Promise<{ id: string; alias: string; bankCode: string; branch: string; accountNumber: string }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      try {
        const row = await tx.bankAccount.create({
          data: {
            tenantId: ctx.tenantId,
            legalEntityId: dto.legalEntityId,
            bankCode: dto.bankCode,
            branch: dto.branch,
            accountNumber: dto.accountNumber,
            alias: dto.alias,
            currency: dto.currency ?? 'BRL',
          },
        });
        return {
          id: row.id,
          alias: row.alias,
          bankCode: row.bankCode,
          branch: row.branch,
          accountNumber: row.accountNumber,
        };
      } catch (err) {
        const code =
          typeof err === 'object' && err !== null && 'code' in err
            ? (err as { code?: string }).code
            : undefined;
        if (code === 'P2002') {
          throw new ConflictException('conta bancária já cadastrada neste tenant');
        }
        throw err;
      }
    });
  }

  async listAccounts(
    ctx: { tenantId: string },
  ): Promise<{
    items: {
      id: string;
      alias: string;
      bankCode: string;
      branch: string;
      accountNumber: string;
      currency: string;
      balanceCents: string;
      pendingCount: number;
    }[];
  }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const accounts = await tx.bankAccount.findMany({
        where: { active: true },
        orderBy: { alias: 'asc' },
      });
      // Saldo = soma dos movimentos (crédito +, débito -). Em larga escala
      // seria uma projeção materializada; aqui, com volume pequeno de demo,
      // calculamos ao vivo.
      const items = [];
      for (const a of accounts) {
        const txs = await tx.bankTransaction.findMany({
          where: { bankAccountId: a.id },
          select: { kind: true, amountCents: true, state: true },
        });
        let balance = 0n;
        let pending = 0;
        for (const t of txs) {
          if (t.state !== 'IGNORED') {
            balance += t.kind === 'CREDIT' ? t.amountCents : -t.amountCents;
          }
          if (t.state === 'PENDING') pending++;
        }
        items.push({
          id: a.id,
          alias: a.alias,
          bankCode: a.bankCode,
          branch: a.branch,
          accountNumber: a.accountNumber,
          currency: a.currency,
          balanceCents: balance.toString(),
          pendingCount: pending,
        });
      }
      return { items };
    });
  }

  async importStatement(
    ctx: { tenantId: string; userId: string },
    bankAccountId: string,
    dto: ImportStatementDto,
  ): Promise<{
    statementId: string;
    inserted: number;
    duplicates: number;
  }> {
    if (dto.lines.length === 0) {
      throw new BadRequestException('extrato sem linhas');
    }
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const account = await tx.bankAccount.findUnique({ where: { id: bankAccountId } });
      if (!account) throw new NotFoundException('conta bancária não encontrada');

      const statement = await tx.bankStatement.create({
        data: {
          tenantId: ctx.tenantId,
          bankAccountId,
          source: dto.source,
          periodStart: new Date(dto.periodStart),
          periodEnd: new Date(dto.periodEnd),
          openingBalanceCents: BigInt(dto.openingBalanceCents),
          closingBalanceCents: BigInt(dto.closingBalanceCents),
          importedBy: ctx.userId,
        },
      });

      // AT-18: dedup por (tenantId, bankAccountId, externalId). Uso upsert
      // para que uma linha já conhecida (vinda antes por OFX e agora por API)
      // não duplique nem apague o matched state eventual.
      let inserted = 0;
      let duplicates = 0;
      for (const line of dto.lines) {
        const existing = await tx.bankTransaction.findUnique({
          where: {
            tenantId_bankAccountId_externalId: {
              tenantId: ctx.tenantId,
              bankAccountId,
              externalId: line.externalId,
            },
          },
        });
        if (existing) {
          duplicates++;
          // Só atualiza o vínculo com o batch e campos descritivos;
          // NUNCA mexe em state, matched_*, ou valores canônicos.
          await tx.bankTransaction.update({
            where: { id: existing.id },
            data: {
              statementId: statement.id,
              ...(existing.description !== line.description
                ? { description: line.description }
                : {}),
            },
          });
          continue;
        }
        await tx.bankTransaction.create({
          data: {
            tenantId: ctx.tenantId,
            bankAccountId,
            statementId: statement.id,
            externalId: line.externalId,
            postedAt: new Date(line.postedAt),
            kind: line.kind,
            amountCents: BigInt(line.amountCents),
            description: line.description,
            ...(line.counterpartName !== undefined ? { counterpartName: line.counterpartName } : {}),
            ...(line.counterpartDoc !== undefined ? { counterpartDoc: line.counterpartDoc } : {}),
          },
        });
        inserted++;
      }

      await this.audit.recordInTx(tx, ctx, {
        action: 'finance.bank.statement.import',
        subjectType: 'BankStatement',
        subjectId: statement.id,
        after: {
          bankAccountId,
          source: dto.source,
          lines: dto.lines.length,
          inserted,
          duplicates,
        },
      });

      return { statementId: statement.id, inserted, duplicates };
    });
  }

  async listPending(
    ctx: { tenantId: string },
    bankAccountId: string,
  ): Promise<{
    items: {
      id: string;
      postedAt: string;
      kind: string;
      amountCents: string;
      description: string;
      counterpartName: string | null;
      state: string;
      suggestion: { kind: 'receipt' | 'payment'; id: string; label: string; amountCents: string } | null;
    }[];
  }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const txs = await tx.bankTransaction.findMany({
        where: { bankAccountId, state: 'PENDING' },
        orderBy: { postedAt: 'desc' },
        take: 200,
      });

      // Sugestão auto: procuramos receipt (crédito) ou payment (débito) com
      // exatamente o mesmo amountCents numa janela de ±3 dias. Match por
      // valor + proximidade temporal é o suficiente aqui; quando houver
      // múltiplos candidatos, exibimos o mais próximo.
      const WINDOW_MS = 3 * 86_400_000;
      const items = [];
      for (const t of txs) {
        const windowStart = new Date(t.postedAt.getTime() - WINDOW_MS);
        const windowEnd = new Date(t.postedAt.getTime() + WINDOW_MS);
        let suggestion: {
          kind: 'receipt' | 'payment';
          id: string;
          label: string;
          amountCents: string;
        } | null = null;
        if (t.kind === 'CREDIT') {
          const r = await tx.receipt.findFirst({
            where: {
              amountCents: t.amountCents,
              receivedAt: { gte: windowStart, lte: windowEnd },
            },
            orderBy: { receivedAt: 'asc' },
            select: {
              id: true,
              amountCents: true,
              receivedAt: true,
              reference: true,
              source: true,
            },
          });
          if (r) {
            const label = r.reference ?? `${r.source.toLowerCase()} · ${r.receivedAt.toISOString().slice(0, 10)}`;
            suggestion = {
              kind: 'receipt',
              id: r.id,
              label,
              amountCents: r.amountCents.toString(),
            };
          }
        } else {
          const p = await tx.payment.findFirst({
            where: {
              amountCents: t.amountCents,
              paidAt: { gte: windowStart, lte: windowEnd },
              externalStatus: 'CONFIRMED',
            },
            orderBy: { paidAt: 'asc' },
            select: {
              id: true,
              amountCents: true,
              paidAt: true,
              reference: true,
              allocations: {
                select: { payable: { select: { supplierName: true } } },
                take: 1,
              },
            },
          });
          if (p) {
            const supplier = p.allocations[0]?.payable.supplierName ?? '—';
            suggestion = {
              kind: 'payment',
              id: p.id,
              label: `${supplier} · ${p.paidAt.toISOString().slice(0, 10)}`,
              amountCents: p.amountCents.toString(),
            };
          }
        }
        items.push({
          id: t.id,
          postedAt: t.postedAt.toISOString(),
          kind: t.kind,
          amountCents: t.amountCents.toString(),
          description: t.description,
          counterpartName: t.counterpartName,
          state: t.state,
          suggestion,
        });
      }
      return { items };
    });
  }

  async match(
    ctx: { tenantId: string; userId: string },
    bankTransactionId: string,
    dto: MatchDto,
  ): Promise<{ id: string; state: string }> {
    if (!!dto.receiptId === !!dto.paymentId) {
      throw new BadRequestException(
        'passe exatamente um de receiptId ou paymentId (um ou outro, nunca ambos ou nenhum)',
      );
    }
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const txn = await tx.bankTransaction.findUnique({ where: { id: bankTransactionId } });
      if (!txn) throw new NotFoundException('movimento não encontrado');
      if (txn.state !== 'PENDING') {
        throw new ConflictException(`movimento ${txn.state.toLowerCase()} — não aceita match`);
      }

      if (dto.receiptId) {
        if (txn.kind !== 'CREDIT') {
          throw new BadRequestException('receipt só casa com movimento CREDIT');
        }
        const r = await tx.receipt.findUnique({ where: { id: dto.receiptId } });
        if (!r) throw new NotFoundException('receipt não encontrado');
        if (r.amountCents !== txn.amountCents) {
          throw new ConflictException(
            `valor divergente: receipt ${r.amountCents.toString()} vs movimento ${txn.amountCents.toString()}`,
          );
        }
      } else if (dto.paymentId) {
        if (txn.kind !== 'DEBIT') {
          throw new BadRequestException('payment só casa com movimento DEBIT');
        }
        const p = await tx.payment.findUnique({ where: { id: dto.paymentId } });
        if (!p) throw new NotFoundException('payment não encontrado');
        if (p.amountCents !== txn.amountCents) {
          throw new ConflictException(
            `valor divergente: payment ${p.amountCents.toString()} vs movimento ${txn.amountCents.toString()}`,
          );
        }
      }

      const updated = await tx.bankTransaction.update({
        where: { id: bankTransactionId },
        data: {
          state: 'MATCHED',
          ...(dto.receiptId ? { matchedReceiptId: dto.receiptId } : {}),
          ...(dto.paymentId ? { matchedPaymentId: dto.paymentId } : {}),
          matchedAt: new Date(),
          matchedBy: ctx.userId,
        },
      });

      await this.audit.recordInTx(tx, ctx, {
        action: 'finance.bank.txn.match',
        subjectType: 'BankTransaction',
        subjectId: bankTransactionId,
        before: { state: 'PENDING' },
        after: {
          state: 'MATCHED',
          receiptId: dto.receiptId ?? null,
          paymentId: dto.paymentId ?? null,
        },
      });

      return { id: updated.id, state: updated.state };
    });
  }

  async unmatch(
    ctx: { tenantId: string; userId: string },
    bankTransactionId: string,
  ): Promise<{ id: string; state: string }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const txn = await tx.bankTransaction.findUnique({ where: { id: bankTransactionId } });
      if (!txn) throw new NotFoundException('movimento não encontrado');
      if (txn.state !== 'MATCHED') {
        throw new ConflictException('só movimentos MATCHED podem voltar para PENDING');
      }
      const updated = await tx.bankTransaction.update({
        where: { id: bankTransactionId },
        data: {
          state: 'PENDING',
          matchedReceiptId: null,
          matchedPaymentId: null,
          matchedAt: null,
          matchedBy: null,
        },
      });
      await this.audit.recordInTx(tx, ctx, {
        action: 'finance.bank.txn.unmatch',
        subjectType: 'BankTransaction',
        subjectId: bankTransactionId,
        before: {
          state: 'MATCHED',
          receiptId: txn.matchedReceiptId,
          paymentId: txn.matchedPaymentId,
        },
        after: { state: 'PENDING' },
      });
      return { id: updated.id, state: updated.state };
    });
  }

  async ignore(
    ctx: { tenantId: string; userId: string },
    bankTransactionId: string,
    reason: string,
  ): Promise<{ id: string; state: string }> {
    if (!reason || reason.trim().length < 3) {
      throw new BadRequestException('motivo obrigatório (mín. 3 caracteres)');
    }
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const txn = await tx.bankTransaction.findUnique({ where: { id: bankTransactionId } });
      if (!txn) throw new NotFoundException('movimento não encontrado');
      if (txn.state !== 'PENDING') {
        throw new ConflictException('só PENDING pode ser ignorado');
      }
      const updated = await tx.bankTransaction.update({
        where: { id: bankTransactionId },
        data: { state: 'IGNORED' },
      });
      await this.audit.recordInTx(tx, ctx, {
        action: 'finance.bank.txn.ignore',
        subjectType: 'BankTransaction',
        subjectId: bankTransactionId,
        reason: reason.trim(),
        before: { state: 'PENDING' },
        after: { state: 'IGNORED' },
      });
      return { id: updated.id, state: updated.state };
    });
  }
}
