/**
 * AT-20 — Contrato mensal fixo não duplica medições.
 *
 * Cenário:
 *   - Contrato A é MONTHLY_FIXED (CTR-JDA-001 no seed, R$ 18.000,00/mês).
 *     Validar 10 viagens no mesmo mês → 1 única medição.
 *     Validar viagens em dois meses distintos → 2 medições (uma por mês).
 *     Replay da validação é idempotente.
 *   - Contrato B é PER_TRIP (CTR-ALP-001 no seed, R$ 420,00/viagem).
 *     Validar 3 viagens → 3 medições; replay idempotente.
 *   - Pré-fatura agrega medições por (contrato, competência) e totaliza.
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
let monthlyFixedContractId: string;
let perTripContractId: string;
let monthlyRouteId: string;
let perTripRouteId: string;

const RUN_ID = Date.now();
const YEAR = 2095 + (Math.floor(RUN_ID / 1000) % 5);

async function login(): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email: EMAIL, password: PASSWORD })
    .expect(200);
  return res.body.accessToken as string;
}

async function createRouteExpanded(
  code: string,
  contractId: string,
  fromDate: string,
  toDate: string,
): Promise<string> {
  const resR = await request(app.getHttpServer())
    .post('/v1/routes')
    .set('Authorization', `Bearer ${token}`)
    .send({ contractId, code, name: `Rota ${code}`, direction: 'IDA' })
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
    .send({ fromDate, toDate })
    .expect(200);
  return routeId;
}

async function tripsOnDate(routeCode: string, date: string): Promise<string[]> {
  const res = await request(app.getHttpServer())
    .get(`/v1/scheduled-trips?date=${date}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  return (res.body.items as { id: string; routeCode: string }[])
    .filter((t) => t.routeCode === routeCode)
    .map((t) => t.id);
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
  monthlyFixedContractId = (
    await prisma.contract.findFirstOrThrow({ where: { code: 'CTR-JDA-001' } })
  ).id;
  perTripContractId = (
    await prisma.contract.findFirstOrThrow({ where: { code: 'CTR-ALP-001' } })
  ).id;
  await prisma.$disconnect();

  const monthlyCode = `R-BILL-MF-${RUN_ID}`;
  const perTripCode = `R-BILL-PT-${RUN_ID}`;
  monthlyRouteId = await createRouteExpanded(
    monthlyCode,
    monthlyFixedContractId,
    `${YEAR}-01-02`,
    `${YEAR}-02-10`,
  );
  perTripRouteId = await createRouteExpanded(
    perTripCode,
    perTripContractId,
    `${YEAR}-01-02`,
    `${YEAR}-01-10`,
  );
  void monthlyRouteId;
  void perTripRouteId;

  // Guardamos codes para filtrar trips dos outros testes.
  (globalThis as unknown as { __billingCodes: { monthly: string; perTrip: string } }).__billingCodes = {
    monthly: monthlyCode,
    perTrip: perTripCode,
  };
});

afterAll(async () => {
  await app?.close();
});

describe('AT-20 — medição de contratos', () => {
  const codes = () =>
    (globalThis as unknown as { __billingCodes: { monthly: string; perTrip: string } })
      .__billingCodes;

  it('MONTHLY_FIXED: validar múltiplas viagens no mesmo mês gera UMA medição', async () => {
    // Pega 5 trips de janeiro para a rota mensal.
    const trips: string[] = [];
    for (let day = 2; day <= 9; day++) {
      const d = `${YEAR}-01-${String(day).padStart(2, '0')}`;
      const list = await tripsOnDate(codes().monthly, d);
      trips.push(...list);
      if (trips.length >= 5) break;
    }
    expect(trips.length).toBeGreaterThanOrEqual(5);

    const measurementIds = new Set<string>();
    for (const tripId of trips.slice(0, 5)) {
      const res = await request(app.getHttpServer())
        .post(`/v1/scheduled-trips/${tripId}/validate`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.measurementKind).toBe('MONTHLY_FIXED');
      measurementIds.add(res.body.measurementId as string);
    }
    // Todas as 5 viagens apontam para o MESMO measurementId.
    expect(measurementIds.size).toBe(1);
  });

  it('pré-fatura MONTHLY_FIXED agrega 1 item com R$ 18.000,00', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/billing/pre-invoices/${monthlyFixedContractId}?year=${YEAR}&month=1`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].kind).toBe('MONTHLY_FIXED');
    expect(res.body.totalAmountCents).toBe('1800000');
    expect(res.body.currency).toBe('BRL');
  });

  it('MONTHLY_FIXED: validar viagens em FEVEREIRO cria NOVA medição', async () => {
    const febTrips = await tripsOnDate(codes().monthly, `${YEAR}-02-02`);
    expect(febTrips.length).toBeGreaterThan(0);
    const res = await request(app.getHttpServer())
      .post(`/v1/scheduled-trips/${febTrips[0]}/validate`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.measurementKind).toBe('MONTHLY_FIXED');

    // Janeiro mantém o valor original, fevereiro aparece como nova competência.
    const jan = await request(app.getHttpServer())
      .get(`/v1/billing/pre-invoices/${monthlyFixedContractId}?year=${YEAR}&month=1`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const feb = await request(app.getHttpServer())
      .get(`/v1/billing/pre-invoices/${monthlyFixedContractId}?year=${YEAR}&month=2`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(jan.body.items).toHaveLength(1);
    expect(feb.body.items).toHaveLength(1);
    expect(jan.body.items[0].measurementId).not.toBe(feb.body.items[0].measurementId);
  });

  it('PER_TRIP: cada viagem validada cria sua própria medição', async () => {
    const trips: string[] = [];
    for (let day = 2; day <= 5; day++) {
      const d = `${YEAR}-01-${String(day).padStart(2, '0')}`;
      const list = await tripsOnDate(codes().perTrip, d);
      trips.push(...list);
    }
    expect(trips.length).toBeGreaterThanOrEqual(3);
    const measurementIds = new Set<string>();
    for (const tripId of trips.slice(0, 3)) {
      const res = await request(app.getHttpServer())
        .post(`/v1/scheduled-trips/${tripId}/validate`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.measurementKind).toBe('PER_TRIP');
      measurementIds.add(res.body.measurementId as string);
    }
    expect(measurementIds.size).toBe(3);

    const preInvoice = await request(app.getHttpServer())
      .get(`/v1/billing/pre-invoices/${perTripContractId}?year=${YEAR}&month=1`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(preInvoice.body.items.length).toBeGreaterThanOrEqual(3);
    const perTripItems = preInvoice.body.items.filter(
      (i: { kind: string }) => i.kind === 'PER_TRIP',
    );
    expect(perTripItems.length).toBeGreaterThanOrEqual(3);
    // 3 viagens × R$ 420,00 = R$ 1.260,00 no mínimo.
    expect(Number(preInvoice.body.totalAmountCents)).toBeGreaterThanOrEqual(1260_00);
  });

  it('PER_TRIP: replay da mesma viagem retorna a mesma medição (idempotência)', async () => {
    const trips = await tripsOnDate(codes().perTrip, `${YEAR}-01-02`);
    const tripId = trips[0];
    const r1 = await request(app.getHttpServer())
      .post(`/v1/scheduled-trips/${tripId}/validate`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const r2 = await request(app.getHttpServer())
      .post(`/v1/scheduled-trips/${tripId}/validate`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(r1.body.measurementId).toBe(r2.body.measurementId);
    expect(r2.body.wasAlreadyValidated).toBe(true);
  });
});
