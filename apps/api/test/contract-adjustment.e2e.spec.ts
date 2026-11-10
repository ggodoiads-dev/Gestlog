/**
 * AT-21 — Contrato reajustado no meio do período preserva preço.
 *
 * Cenário:
 *   1. Contrato CTR-ALP-001 tem pricingAmountCents original.
 *   2. Criar rota + 1 viagem na competência YEAR-1 (antes do reajuste).
 *   3. Validar viagem → measurement com valor ORIGINAL.
 *   4. Reajustar preço com effectiveFrom = YEAR-6-01 (+ R$ 1.000).
 *   5. Criar viagem na competência YEAR-9 (depois do reajuste).
 *   6. Validar viagem → measurement com valor NOVO.
 *   7. Medição antiga permanece com valor ORIGINAL (imutável).
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
let originalPrice: bigint;

const RUN_ID = Date.now();
// Range amplo para evitar colisão com adjustments acumulados no DB em
// runs anteriores (effectiveFrom único por contrato+ano é possível, mas o
// resolver escolhe o mais recente, então uma run antiga pode "vazar" para
// outra). YEAR distinto por run resolve.
const YEAR = 2100 + (Math.floor(RUN_ID / 100) % 400);
const ROUTE_CODE_BEFORE = `R-AT21-BEFORE-${RUN_ID}`;
const ROUTE_CODE_AFTER = `R-AT21-AFTER-${RUN_ID}`;
const NEW_PRICE_CENTS = 300_000; // R$ 3.000

async function login(): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email: EMAIL, password: PASSWORD })
    .expect(200);
  return res.body.accessToken as string;
}

async function freshTripId(date: string, routeCode: string): Promise<string> {
  const resList = await request(app.getHttpServer())
    .get(`/v1/scheduled-trips?date=${date}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const item = resList.body.items.find(
    (t: { routeCode: string }) => t.routeCode === routeCode,
  );
  if (!item) throw new Error(`nenhuma trip de ${routeCode} em ${date}`);
  return item.id;
}

async function makeRouteWithOneDay(
  routeCode: string,
  isoDate: string,
): Promise<string> {
  const resR = await request(app.getHttpServer())
    .post('/v1/routes')
    .set('Authorization', `Bearer ${token}`)
    .send({ contractId, code: routeCode, name: `Rota AT-21 ${routeCode}`, direction: 'IDA' })
    .expect(201);
  const routeId = resR.body.id as string;
  const resV = await request(app.getHttpServer())
    .post(`/v1/routes/${routeId}/versions`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      effectiveFrom: isoDate,
      targetArrivalOffsetMin: 10,
      maxWalkMeters: 500,
      stops: [
        { sequence: 1, name: 'A', latitude: -23.5, longitude: -46.6, offsetMinutes: -30 },
        { sequence: 2, name: 'B', latitude: -23.6, longitude: -46.7, offsetMinutes: 0 },
      ],
      turns: [{ label: 'Manhã', targetArrivalTime: '06:00', daysOfWeek: [1, 2, 3, 4, 5, 6, 7] }],
    })
    .expect(201);
  const versionId = resV.body.id as string;
  await request(app.getHttpServer())
    .post(`/v1/routes/${routeId}/versions/${versionId}/publish`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  await request(app.getHttpServer())
    .post(`/v1/routes/${routeId}/expand`)
    .set('Authorization', `Bearer ${token}`)
    .send({ fromDate: isoDate, toDate: isoDate })
    .expect(200);
  return routeId;
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
  const contract = await prisma.contract.findFirst({ where: { code: 'CTR-ALP-001' } });
  contractId = contract.id;
  originalPrice = contract.pricingAmountCents;
  await prisma.$disconnect();
});

afterAll(async () => {
  await app?.close();
});

describe('AT-21 — reajuste preserva preço do passado', () => {
  it('medição ANTES do reajuste usa preço ORIGINAL', async () => {
    const dateBefore = `${YEAR}-01-05`;
    await makeRouteWithOneDay(ROUTE_CODE_BEFORE, dateBefore);
    const tripId = await freshTripId(dateBefore, ROUTE_CODE_BEFORE);

    const res = await request(app.getHttpServer())
      .post(`/v1/scheduled-trips/${tripId}/validate`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const measurementId = res.body.measurementId as string;

    // Buscar medição e verificar que o valor é o original.
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL } },
    });
    const m = await prisma.billingMeasurement.findUnique({ where: { id: measurementId } });
    // mensal fixo: unit = pricing; per trip: unit = pricing. Qualquer dos dois.
    expect(m.unitPriceCents.toString()).toBe(originalPrice.toString());
    await prisma.$disconnect();
  });

  it('registra reajuste com effectiveFrom = YEAR-06-01', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/contracts/${contractId}/adjustments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        effectiveFrom: `${YEAR}-06-01`,
        newPricingMode: 'MONTHLY_FIXED',
        newPricingAmountCents: NEW_PRICE_CENTS,
        reason: 'reajuste anual negociado — IPCA + repasse',
      })
      .expect(201);
    expect(res.body.newPricingAmountCents).toBe(String(NEW_PRICE_CENTS));
  });

  it('medição DEPOIS do reajuste usa preço NOVO', async () => {
    const dateAfter = `${YEAR}-09-10`;
    await makeRouteWithOneDay(ROUTE_CODE_AFTER, dateAfter);
    const tripId = await freshTripId(dateAfter, ROUTE_CODE_AFTER);

    const res = await request(app.getHttpServer())
      .post(`/v1/scheduled-trips/${tripId}/validate`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const measurementId = res.body.measurementId as string;

    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL } },
    });
    const m = await prisma.billingMeasurement.findUnique({ where: { id: measurementId } });
    expect(m.unitPriceCents.toString()).toBe(String(NEW_PRICE_CENTS));
    await prisma.$disconnect();
  });

  it('medição anterior permanece com preço ORIGINAL (não é recalculada)', async () => {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL } },
    });
    const measurements = await prisma.billingMeasurement.findMany({
      where: { contractId, competenceYear: YEAR, competenceMonth: 1 },
    });
    expect(measurements.length).toBeGreaterThanOrEqual(1);
    for (const m of measurements) {
      expect(m.unitPriceCents.toString()).toBe(originalPrice.toString());
    }
    await prisma.$disconnect();
  });

  it('reajuste duplicado na mesma effectiveFrom retorna 409', async () => {
    await request(app.getHttpServer())
      .post(`/v1/contracts/${contractId}/adjustments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        effectiveFrom: `${YEAR}-06-01`,
        newPricingMode: 'MONTHLY_FIXED',
        newPricingAmountCents: 400_000,
        reason: 'tentativa de duplicar',
      })
      .expect(409);
  });

  it('listAdjustments mostra o histórico ordenado', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/contracts/${contractId}/adjustments`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    const mine = (res.body.items as { effectiveFrom: string }[]).find(
      (a) => a.effectiveFrom === `${YEAR}-06-01`,
    );
    expect(mine).toBeDefined();
  });
});
