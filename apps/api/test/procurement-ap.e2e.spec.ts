/**
 * AT-16 — Pedido parcialmente recebido, parcialmente faturado e
 * parcialmente pago: saldos e compromissos NÃO duplicam.
 *
 * Também cobre §27 do prompt:
 *   - Pagamento com externalStatus=UNKNOWN NÃO atualiza saldo.
 *   - Replay com mesma Idempotency-Key retorna o pagamento original.
 *   - Overpayment em payable → 409.
 *   - Faturar além do recebido (3-way grosseiro) → 409.
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const { AppModule } = require('../dist/app.module.js') as { AppModule: unknown };

const PASSWORD = 'demo-password-only!';
const ADMIN = 'admin.pct@demo.gestlog.local';

let app: INestApplication;
let token: string;
let legalEntityId: string;
const RUN_ID = Date.now();
const PO_CODE = `PO-AT16-${RUN_ID}`;

beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const moduleRef = await Test.createTestingModule({ imports: [AppModule as any] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready', 'health/integrations'] });
  await app.init();
  const login = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email: ADMIN, password: PASSWORD })
    .expect(200);
  token = login.body.accessToken as string;

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL } },
  });
  legalEntityId = (await prisma.legalEntity.findFirstOrThrow({ where: { cnpj: '00000000000191' } }))
    .id;
  await prisma.$disconnect();
});

afterAll(async () => {
  await app?.close();
});

describe('AT-16 — procurement + AP sem duplicação', () => {
  let orderId: string;
  let payableAId: string;
  let payableBId: string;

  it('cria pedido de R$ 10.000,00 em OPEN', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        legalEntityId,
        code: PO_CODE,
        supplierName: 'Fornecedor DEMO LTDA',
        supplierCnpj: '00000000000772',
        description: 'Peças de manutenção',
        amountCents: '1000000',
      })
      .expect(201);
    expect(res.body.status).toBe('OPEN');
    orderId = res.body.id;
  });

  it('recebimento parcial de R$ 4.000,00 → PARTIALLY_RECEIVED', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/purchase-orders/${orderId}/receipts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amountCents: '400000', reference: 'NF 123' })
      .expect(201);
    expect(res.body.order.status).toBe('PARTIALLY_RECEIVED');
    expect(res.body.order.receivedCents).toBe('400000');
    expect(res.body.order.remainingCents).toBe('600000');
  });

  it('overreceive bloqueado: tentativa de R$ 7.000 > restante R$ 6.000 → 409', async () => {
    await request(app.getHttpServer())
      .post(`/v1/purchase-orders/${orderId}/receipts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amountCents: '700000' })
      .expect(409);
  });

  it('faturar R$ 4.000 do que foi recebido → payable OPEN', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/payables')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderId,
        supplierName: 'Fornecedor DEMO LTDA',
        description: 'Fatura parcial',
        amountCents: '400000',
        dueDate: '2030-12-31',
      })
      .expect(201);
    expect(res.body.status).toBe('OPEN');
    payableAId = res.body.id;
  });

  it('faturar além do recebido é bloqueado (3-way): R$ 500 excedentes → 409', async () => {
    await request(app.getHttpServer())
      .post('/v1/payables')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderId,
        supplierName: 'Fornecedor DEMO LTDA',
        description: 'Fatura invalida',
        amountCents: '50000',
        dueDate: '2030-12-31',
      })
      .expect(409);
  });

  it('segundo recebimento R$ 6.000,00 → RECEIVED (total)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/purchase-orders/${orderId}/receipts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amountCents: '600000', reference: 'NF 124' })
      .expect(201);
    expect(res.body.order.status).toBe('RECEIVED');
    expect(res.body.order.remainingCents).toBe('0');
  });

  it('agora pode faturar o restante R$ 6.000', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/payables')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderId,
        supplierName: 'Fornecedor DEMO LTDA',
        description: 'Fatura final',
        amountCents: '600000',
        dueDate: '2030-12-31',
      })
      .expect(201);
    payableBId = res.body.id;
  });

  it('pagamento com externalStatus=UNKNOWN NÃO atualiza saldo (§27)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/payables/${payableAId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `pay-unknown-${RUN_ID}`)
      .send({
        amountCents: '400000',
        method: 'BANK_API',
        externalStatus: 'UNKNOWN',
        reference: 'TED timeout',
      })
      .expect(201);
    expect(res.body.externalStatus).toBe('UNKNOWN');
    // Status do payable NÃO muda por UNKNOWN.
    expect(res.body.payable.status).toBe('OPEN');
    expect(res.body.payable.paidCents).toBe('0');
  });

  it('replay do mesmo pagamento UNKNOWN com mesma chave → dedupe', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/payables/${payableAId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `pay-unknown-${RUN_ID}`)
      .send({
        amountCents: '400000',
        method: 'BANK_API',
        externalStatus: 'UNKNOWN',
      })
      .expect(201);
    expect(res.body.wasDeduped).toBe(true);
    // Saldo continua em 0 — UNKNOWN nunca aplicou.
    expect(res.body.payable.paidCents).toBe('0');
  });

  it('pagamento CONFIRMED fecha o payable A → PAID', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/payables/${payableAId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `pay-confirmed-${RUN_ID}`)
      .send({
        amountCents: '400000',
        method: 'MANUAL',
        externalStatus: 'CONFIRMED',
      })
      .expect(201);
    expect(res.body.payable.status).toBe('PAID');
    expect(res.body.payable.balanceCents).toBe('0');
  });

  it('overpayment no payable B → 409', async () => {
    await request(app.getHttpServer())
      .post(`/v1/payables/${payableBId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `pay-over-${RUN_ID}`)
      .send({ amountCents: '99999999', method: 'MANUAL' })
      .expect(409);
  });

  it('listagem /v1/payables mostra B em aberto, A fora (PAID)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/payables')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const ids = (res.body.items as { id: string }[]).map((p) => p.id);
    expect(ids).toContain(payableBId);
    expect(ids).not.toContain(payableAId);
  });
});
