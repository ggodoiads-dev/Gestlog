/**
 * Cadeia operação → cobrança. Garante que:
 *   1. Emitir Receivable a partir da pré-fatura usa o totalAmountCents
 *      vindo do livro de medição.
 *   2. Emitir duas vezes a mesma (contract, competência) retorna o
 *      MESMO receivable (unique nativo) — nunca duplica cobrança.
 *   3. Tentar emitir sem medições na competência → 400.
 *   4. Isolamento: outro tenant não lista os receivables.
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const { AppModule } = require('../dist/app.module.js') as { AppModule: unknown };

const EMAIL_A = 'admin.pct@demo.gestlog.local';
const EMAIL_B = 'admin.citybus@demo.gestlog.local';
const PASSWORD = 'demo-password-only!';

let app: INestApplication;
let tokenA: string;
let tokenB: string;
let contractId: string;
let routeId: string;

const YEAR = 2070 + (process.pid % 20);
const RUN_ID = Date.now();

async function login(email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return res.body.accessToken as string;
}

beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const moduleRef = await Test.createTestingModule({ imports: [AppModule as any] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready', 'health/integrations'] });
  await app.init();
  [tokenA, tokenB] = await Promise.all([login(EMAIL_A), login(EMAIL_B)]);

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL } },
  });
  // Usa contrato MONTHLY_FIXED (R$ 18.000,00/mês).
  contractId = (await prisma.contract.findFirstOrThrow({ where: { code: 'CTR-JDA-001' } })).id;
  await prisma.$disconnect();

  // Monta rota + viagens + validação para produzir medição mensal.
  const resR = await request(app.getHttpServer())
    .post('/v1/routes')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({
      contractId,
      code: `R-AR-${RUN_ID}`,
      name: 'Rota AR',
      direction: 'IDA',
    })
    .expect(201);
  routeId = resR.body.id as string;

  const resV = await request(app.getHttpServer())
    .post(`/v1/routes/${routeId}/versions`)
    .set('Authorization', `Bearer ${tokenA}`)
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
    .set('Authorization', `Bearer ${tokenA}`)
    .expect(200);
  await request(app.getHttpServer())
    .post(`/v1/routes/${routeId}/expand`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ fromDate: `${YEAR}-01-02`, toDate: `${YEAR}-01-05` })
    .expect(200);

  const resList = await request(app.getHttpServer())
    .get(`/v1/scheduled-trips?date=${YEAR}-01-02`)
    .set('Authorization', `Bearer ${tokenA}`)
    .expect(200);
  const trip = resList.body.items.find(
    (t: { routeCode: string }) => t.routeCode === `R-AR-${RUN_ID}`,
  );
  await request(app.getHttpServer())
    .post(`/v1/scheduled-trips/${trip.id}/validate`)
    .set('Authorization', `Bearer ${tokenA}`)
    .expect(200);
});

afterAll(async () => {
  await app?.close();
});

describe('AR — emissão de Receivable a partir da pré-fatura', () => {
  it('emite receivable com valor da pré-fatura (R$ 18.000,00)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/billing/pre-invoices/${contractId}/issue`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ competenceYear: YEAR, competenceMonth: 1 })
      .expect(200);
    expect(res.body.amountCents).toBe('1800000');
    expect(res.body.currency).toBe('BRL');
    expect(res.body.wasAlreadyIssued).toBe(false);
    expect(res.body.competence).toBe(`${YEAR}-01`);
    expect(res.body.status).toBe('OPEN');
    // Vencimento default: dia 10 do mês seguinte à competência.
    expect(res.body.dueDate).toBe(`${YEAR}-02-10`);
  });

  it('re-emissão da mesma competência retorna MESMO receivable (não duplica)', async () => {
    const r1 = await request(app.getHttpServer())
      .post(`/v1/billing/pre-invoices/${contractId}/issue`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ competenceYear: YEAR, competenceMonth: 1 })
      .expect(200);
    const r2 = await request(app.getHttpServer())
      .post(`/v1/billing/pre-invoices/${contractId}/issue`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ competenceYear: YEAR, competenceMonth: 1 })
      .expect(200);
    expect(r2.body.id).toBe(r1.body.id);
    expect(r2.body.wasAlreadyIssued).toBe(true);
  });

  it('competência sem medições → 400', async () => {
    await request(app.getHttpServer())
      .post(`/v1/billing/pre-invoices/${contractId}/issue`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ competenceYear: YEAR, competenceMonth: 7 })
      .expect(400);
  });

  it('listagem de recebíveis em aberto é isolada por tenant', async () => {
    const listA = await request(app.getHttpServer())
      .get('/v1/receivables')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const listB = await request(app.getHttpServer())
      .get('/v1/receivables')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    const idsA = new Set((listA.body.items as { id: string }[]).map((r) => r.id));
    const idsB = new Set((listB.body.items as { id: string }[]).map((r) => r.id));
    // Interseção vazia: tenants diferentes nunca compartilham receivable.
    const inter = [...idsA].filter((id) => idsB.has(id));
    expect(inter).toEqual([]);
    // A deve ter pelo menos o receivable que acabamos de emitir.
    expect(idsA.size).toBeGreaterThanOrEqual(1);
  });

  it('dueDate customizado é respeitado', async () => {
    // Fazemos uma trip em FEVEREIRO para gerar nova competência.
    await request(app.getHttpServer())
      .post(`/v1/routes/${routeId}/expand`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ fromDate: `${YEAR}-02-02`, toDate: `${YEAR}-02-05` })
      .expect(200);
    const listFeb = await request(app.getHttpServer())
      .get(`/v1/scheduled-trips?date=${YEAR}-02-02`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const tripFeb = (listFeb.body.items as { id: string; routeCode: string }[]).find(
      (t) => t.routeCode === `R-AR-${RUN_ID}`,
    )!;
    await request(app.getHttpServer())
      .post(`/v1/scheduled-trips/${tripFeb.id}/validate`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .post(`/v1/billing/pre-invoices/${contractId}/issue`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ competenceYear: YEAR, competenceMonth: 2, dueDate: `${YEAR}-03-20` })
      .expect(200);
    expect(res.body.dueDate).toBe(`${YEAR}-03-20`);
  });
});
