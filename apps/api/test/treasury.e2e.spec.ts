/**
 * Treasury: importação idempotente (AT-18) + reconciliação bilateral.
 *
 * AT-18 — OFX e API trazem o mesmo movimento → importação não duplica.
 * Modelado com unique (tenantId, bankAccountId, externalId); dupla
 * importação com mesmo externalId vira UPDATE ao statement vigente, sem
 * mexer em state, matched_* ou valores canônicos.
 *
 * Reconciliação bilateral:
 *   - CREDIT ↔ Receipt (entrada)
 *   - DEBIT  ↔ Payment  (saída CONFIRMED)
 *   - valor divergente bloqueia
 *   - segunda tentativa de match retorna 409
 *   - unmatch volta para PENDING
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const { AppModule } = require('../dist/app.module.js') as { AppModule: unknown };

const ADMIN_EMAIL = 'admin.pct@demo.gestlog.local';
const ADMIN_PASSWORD = 'demo-password-only!';

let app: INestApplication;
let token: string;
let legalEntityId: string;
let bankAccountId: string;

const RUN_ID = Date.now();
const EXTERNAL_PREFIX = `FITID-${RUN_ID}`;
// Competence unique por run para não colidir com outros testes AR/Billing
// no mesmo contrato (unique: tenantId + contractId + year + month).
const COMPETENCE_YEAR = 2200 + (Math.floor(RUN_ID / 10000) % 50);
const COMPETENCE_MONTH = (Math.abs(RUN_ID) % 12) + 1;

function iso(y: number, m: number, d: number, h = 12, min = 0): string {
  return new Date(Date.UTC(y, m - 1, d, h, min)).toISOString();
}

async function login(email: string, password: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return res.body.accessToken as string;
}

beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const moduleRef = await Test.createTestingModule({ imports: [AppModule as any] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready', 'health/integrations'] });
  await app.init();
  token = await login(ADMIN_EMAIL, ADMIN_PASSWORD);

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL } },
  });
  const contract = await prisma.contract.findFirst({ where: { code: 'CTR-ALP-001' } });
  legalEntityId = contract.legalEntityId;
  await prisma.$disconnect();

  // Conta bancária única por run.
  const resAcc = await request(app.getHttpServer())
    .post('/v1/bank-accounts')
    .set('Authorization', `Bearer ${token}`)
    .send({
      legalEntityId,
      bankCode: `${RUN_ID % 1000}`.padStart(3, '0'),
      branch: `${(RUN_ID % 10_000) + 1000}`,
      accountNumber: `${RUN_ID}`.slice(-10),
      alias: `Treasury AT-18 ${RUN_ID}`,
    })
    .expect(201);
  bankAccountId = resAcc.body.id;
});

afterAll(async () => {
  await app?.close();
});

describe('Treasury AT-18 — importação não duplica', () => {
  it('primeira importação OFX cria N linhas', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/bank-accounts/${bankAccountId}/statements`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        source: 'ofx',
        periodStart: iso(2130, 3, 1, 0),
        periodEnd: iso(2130, 3, 31, 23, 59),
        openingBalanceCents: 0,
        closingBalanceCents: 15000,
        lines: [
          {
            externalId: `${EXTERNAL_PREFIX}-1`,
            postedAt: iso(2130, 3, 10),
            kind: 'CREDIT',
            amountCents: 10000,
            description: 'TED cliente A',
          },
          {
            externalId: `${EXTERNAL_PREFIX}-2`,
            postedAt: iso(2130, 3, 12),
            kind: 'CREDIT',
            amountCents: 5000,
            description: 'TED cliente B',
          },
        ],
      })
      .expect(201);
    expect(res.body.inserted).toBe(2);
    expect(res.body.duplicates).toBe(0);
  });

  it('segunda importação API com mesmos externalIds reaproveita linhas (dup=2, ins=0)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/bank-accounts/${bankAccountId}/statements`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        source: 'api',
        periodStart: iso(2130, 3, 1, 0),
        periodEnd: iso(2130, 3, 31, 23, 59),
        openingBalanceCents: 0,
        closingBalanceCents: 15000,
        lines: [
          {
            externalId: `${EXTERNAL_PREFIX}-1`,
            postedAt: iso(2130, 3, 10),
            kind: 'CREDIT',
            amountCents: 10000,
            description: 'TED cliente A',
          },
          {
            externalId: `${EXTERNAL_PREFIX}-2`,
            postedAt: iso(2130, 3, 12),
            kind: 'CREDIT',
            amountCents: 5000,
            description: 'TED cliente B',
          },
        ],
      })
      .expect(201);
    expect(res.body.inserted).toBe(0);
    expect(res.body.duplicates).toBe(2);
  });

  it('listagem de pendentes ainda tem 2 (não houve dup real)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/bank-accounts/${bankAccountId}/transactions/pending`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const mine = (res.body.items as { id: string; description: string }[]).filter(
      (i) =>
        i.description === 'TED cliente A' || i.description === 'TED cliente B',
    );
    expect(mine).toHaveLength(2);
  });
});

describe('Treasury — reconciliação Receipt ↔ CREDIT', () => {
  let receiptId: string;
  let bankTxnId: string;

  it('cria um Receipt avulso de 10000 centavos via API interna (dedicated route)', async () => {
    // Uso o fluxo real: receivable → receipt. Primeiro preciso de um
    // receivable aberto. O seed não garante isso, então uso prisma admin
    // para criar um Receipt desvinculado é inviável (não há tal rota).
    // Em vez disso: emito receivable sintético via Prisma admin + receipt
    // via /v1/receivables/:id/receipts.
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL } },
    });
    const me = await request(app.getHttpServer())
      .get('/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const tenantId = me.body.tenant.id as string;

    const contract = await prisma.contract.findFirst({ where: { code: 'CTR-ALP-001' } });
    const receivable = await prisma.receivable.create({
      data: {
        tenantId,
        contractId: contract.id,
        clientId: contract.clientId,
        issuedAt: new Date(iso(COMPETENCE_YEAR, COMPETENCE_MONTH, 9)),
        dueDate: new Date(iso(COMPETENCE_YEAR, COMPETENCE_MONTH, 20)),
        competenceYear: COMPETENCE_YEAR,
        competenceMonth: COMPETENCE_MONTH,
        amountCents: 10000n,
        currency: 'BRL',
        status: 'OPEN',
      },
    });
    await prisma.$disconnect();

    const idemp = crypto.randomBytes(16).toString('hex');
    const res = await request(app.getHttpServer())
      .post(`/v1/receivables/${receivable.id}/receipts`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idemp)
      .send({
        source: 'BANK_API',
        receivedAt: iso(2130, 3, 10),
        amountCents: 10000,
        reference: `PIX-${RUN_ID}-A`,
      })
      .expect(201);
    receiptId = res.body.receiptId as string;

    const pending = await request(app.getHttpServer())
      .get(`/v1/bank-accounts/${bankAccountId}/transactions/pending`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const target = (pending.body.items as { id: string; description: string }[]).find(
      (i) => i.description === 'TED cliente A',
    );
    bankTxnId = target!.id;
  });

  it('match CREDIT ↔ Receipt com mesmo valor passa', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/bank-transactions/${bankTxnId}/match`)
      .set('Authorization', `Bearer ${token}`)
      .send({ receiptId })
      .expect(201);
    expect(res.body.state).toBe('MATCHED');
  });

  it('segunda tentativa de match no mesmo movimento retorna 409', async () => {
    await request(app.getHttpServer())
      .post(`/v1/bank-transactions/${bankTxnId}/match`)
      .set('Authorization', `Bearer ${token}`)
      .send({ receiptId })
      .expect(409);
  });

  it('unmatch devolve o movimento para PENDING', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/bank-transactions/${bankTxnId}/unmatch`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(res.body.state).toBe('PENDING');
  });

  it('match com valor divergente é bloqueado', async () => {
    // Pega o outro movimento (TED cliente B · 5000) e tenta casar com
    // o mesmo receipt (10000). Valor divergente → 409.
    const pending = await request(app.getHttpServer())
      .get(`/v1/bank-accounts/${bankAccountId}/transactions/pending`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const target = (pending.body.items as { id: string; description: string }[]).find(
      (i) => i.description === 'TED cliente B',
    );
    const res = await request(app.getHttpServer())
      .post(`/v1/bank-transactions/${target!.id}/match`)
      .set('Authorization', `Bearer ${token}`)
      .send({ receiptId })
      .expect(409);
    expect(String(res.body.message)).toMatch(/valor divergente/i);
  });

  it('receiptId E paymentId simultâneos são rejeitados (400)', async () => {
    const pending = await request(app.getHttpServer())
      .get(`/v1/bank-accounts/${bankAccountId}/transactions/pending`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const target = (pending.body.items as { id: string; description: string }[]).find(
      (i) => i.description === 'TED cliente B',
    );
    await request(app.getHttpServer())
      .post(`/v1/bank-transactions/${target!.id}/match`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        receiptId,
        paymentId: '00000000-0000-0000-0000-000000000000',
      })
      .expect(400);
  });
});
