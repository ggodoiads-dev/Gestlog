/**
 * AR — pagamentos (Receipts) sobre Receivables.
 *
 * Cenários cobertos:
 *   1. Pagamento parcial muda status para PARTIALLY_PAID; saldo cai.
 *   2. Pagamento que fecha o saldo leva a PAID + paidAt preenchido.
 *   3. Tentar pagar mais do que o saldo (overpayment) retorna 409.
 *   4. Receivable já PAID não aceita novo pagamento (409).
 *   5. Replay com mesma Idempotency-Key retorna mesmo receiptId.
 *   6. Idempotency-Key duplicada em RECEIVABLE diferente retorna 409.
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const { AppModule } = require('../dist/app.module.js') as { AppModule: unknown };

const EMAIL = 'admin.pct@demo.gestlog.local';
const PASSWORD = 'demo-password-only!';

let app: INestApplication;
let token: string;
let contractId: string;
let receivableA: string;
let receivableB: string;

const RUN_ID = Date.now();
const YEAR = 2015 + (Math.floor(RUN_ID / 1000) % 15);

async function login(): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email: EMAIL, password: PASSWORD })
    .expect(200);
  return res.body.accessToken as string;
}

async function setupContractAndReceivable(
  contractCode: 'CTR-JDA-001',
  routeSuffix: string,
  competenceMonth: number,
): Promise<string> {
  const resR = await request(app.getHttpServer())
    .post('/v1/routes')
    .set('Authorization', `Bearer ${token}`)
    .send({
      contractId,
      code: `R-AR-REC-${routeSuffix}-${RUN_ID}`,
      name: `Rota ${routeSuffix}`,
      direction: 'IDA',
    })
    .expect(201);
  const routeId = resR.body.id as string;
  const resV = await request(app.getHttpServer())
    .post(`/v1/routes/${routeId}/versions`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      effectiveFrom: `${YEAR}-01-01`,
      stops: [
        { sequence: 1, name: 'A', latitude: -23.5, longitude: -46.6, offsetMinutes: -40 },
        { sequence: 2, name: 'B', latitude: -23.6, longitude: -46.7, offsetMinutes: 0 },
      ],
      turns: [{ label: 'Manhã', targetArrivalTime: '06:00', daysOfWeek: [1, 2, 3, 4, 5, 6, 7] }],
    })
    .expect(201);
  await request(app.getHttpServer())
    .post(`/v1/routes/${routeId}/versions/${resV.body.id}/publish`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  await request(app.getHttpServer())
    .post(`/v1/routes/${routeId}/expand`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      fromDate: `${YEAR}-${String(competenceMonth).padStart(2, '0')}-02`,
      toDate: `${YEAR}-${String(competenceMonth).padStart(2, '0')}-04`,
    })
    .expect(200);
  const listed = await request(app.getHttpServer())
    .get(`/v1/scheduled-trips?date=${YEAR}-${String(competenceMonth).padStart(2, '0')}-02`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const trip = listed.body.items.find(
    (t: { routeCode: string }) => t.routeCode === `R-AR-REC-${routeSuffix}-${RUN_ID}`,
  );
  await request(app.getHttpServer())
    .post(`/v1/scheduled-trips/${trip.id}/validate`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const issued = await request(app.getHttpServer())
    .post(`/v1/billing/pre-invoices/${contractId}/issue`)
    .set('Authorization', `Bearer ${token}`)
    .send({ competenceYear: YEAR, competenceMonth })
    .expect(200);
  void contractCode;
  return issued.body.id as string;
}

beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const moduleRef = await Test.createTestingModule({ imports: [AppModule as any] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready', 'health/integrations'] });
  await app.init();
  token = await login();

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL } },
  });
  contractId = (await prisma.contract.findFirstOrThrow({ where: { code: 'CTR-JDA-001' } })).id;
  await prisma.$disconnect();

  // Dois receivables em competencias distintas (R$ 18.000,00 cada).
  receivableA = await setupContractAndReceivable('CTR-JDA-001', 'JAN', 1);
  receivableB = await setupContractAndReceivable('CTR-JDA-001', 'FEV', 2);
});

afterAll(async () => {
  await app?.close();
});

describe('AR — pagamentos e alocação', () => {
  it('pagamento parcial muda status para PARTIALLY_PAID e atualiza saldo', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/receivables/${receivableA}/receipts`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `pay-partial-${RUN_ID}-1`)
      .send({ amountCents: '500000', source: 'MANUAL', reference: 'PIX 1' })
      .expect(201);

    expect(res.body.receivable.paidCents).toBe('500000');
    expect(res.body.receivable.balanceCents).toBe('1300000');
    expect(res.body.receivable.status).toBe('PARTIALLY_PAID');
    expect(res.body.receivable.paidAt).toBeNull();
  });

  it('segundo pagamento que fecha o saldo leva a PAID', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/receivables/${receivableA}/receipts`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `pay-final-${RUN_ID}-2`)
      .send({ amountCents: '1300000', source: 'BANK_OFX', reference: 'OFX 2' })
      .expect(201);

    expect(res.body.receivable.paidCents).toBe('1800000');
    expect(res.body.receivable.balanceCents).toBe('0');
    expect(res.body.receivable.status).toBe('PAID');
    expect(res.body.receivable.paidAt).toBeTruthy();
  });

  it('receivable já PAID não aceita novo pagamento', async () => {
    await request(app.getHttpServer())
      .post(`/v1/receivables/${receivableA}/receipts`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `pay-after-paid-${RUN_ID}`)
      .send({ amountCents: '100', source: 'MANUAL' })
      .expect(409);
  });

  it('overpayment em receivable aberto retorna 409', async () => {
    await request(app.getHttpServer())
      .post(`/v1/receivables/${receivableB}/receipts`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `pay-over-${RUN_ID}`)
      .send({ amountCents: '99999999', source: 'MANUAL' })
      .expect(409);
  });

  it('replay com mesma Idempotency-Key retorna mesmo receiptId', async () => {
    const key = `pay-idem-${RUN_ID}`;
    const r1 = await request(app.getHttpServer())
      .post(`/v1/receivables/${receivableB}/receipts`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({ amountCents: '400000', source: 'MANUAL' })
      .expect(201);
    const r2 = await request(app.getHttpServer())
      .post(`/v1/receivables/${receivableB}/receipts`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({ amountCents: '400000', source: 'MANUAL' })
      .expect(201);
    expect(r2.body.receiptId).toBe(r1.body.receiptId);
    expect(r2.body.wasDeduped).toBe(true);
    expect(r2.body.receivable.paidCents).toBe('400000');
  });

  it('Idempotency-Key reusada para OUTRO receivable retorna 409', async () => {
    const key = `pay-shared-${RUN_ID}`;
    await request(app.getHttpServer())
      .post(`/v1/receivables/${receivableB}/receipts`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({ amountCents: '100000', source: 'MANUAL' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/v1/receivables/${receivableA}/receipts`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({ amountCents: '100000', source: 'MANUAL' })
      .expect(409);
  });
});
