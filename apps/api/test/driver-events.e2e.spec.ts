/**
 * AT-11 — Idempotência de eventos do driver app.
 *
 * O motorista offline pode re-enviar o mesmo evento várias vezes
 * (sincronização resiliente). O servidor PRECISA deduplicar: mesma
 * `Idempotency-Key` + mesma intenção → um único fato no banco; mesma
 * chave para intenções diferentes → 409.
 *
 * Também cobre:
 *   - TripExecution criada preguiçosamente no primeiro evento.
 *   - Mudança de estado da ScheduledTrip ao receber TRIP_STARTED.
 *   - Idempotency-Key ausente → 400.
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
let tripId: string;

const YEAR = 2040 + (process.pid % 30);
const RUN_ID = Date.now();
const ROUTE_CODE = `R-AT11-${RUN_ID}`;

async function login(): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email: EMAIL, password: PASSWORD })
    .expect(200);
  return res.body.accessToken as string;
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
  const contractId = contract.id;
  await prisma.$disconnect();

  const resR = await request(app.getHttpServer())
    .post('/v1/routes')
    .set('Authorization', `Bearer ${token}`)
    .send({ contractId, code: ROUTE_CODE, name: 'Rota AT-11', direction: 'IDA' })
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
    .send({ fromDate: `${YEAR}-01-02`, toDate: `${YEAR}-01-05` })
    .expect(200);

  const resList = await request(app.getHttpServer())
    .get(`/v1/scheduled-trips?date=${YEAR}-01-02`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  tripId = resList.body.items.find(
    (t: { routeCode: string }) => t.routeCode === ROUTE_CODE,
  ).id;
});

afterAll(async () => {
  await app?.close();
});

describe('AT-11 — idempotência do driver app', () => {
  const key1 = `idem-${RUN_ID}-driver-presented`;
  const key2 = `idem-${RUN_ID}-trip-started`;
  let firstEventId: string;

  it('primeiro evento cria TripExecution e retorna id', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/scheduled-trips/${tripId}/events`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key1)
      .send({ type: 'DRIVER_PRESENTED', confidence: 'HIGH' })
      .expect(201);

    expect(res.body.wasDeduped).toBe(false);
    expect(res.body.type).toBe('DRIVER_PRESENTED');
    expect(res.body.tripExecutionState).toBe('DRIVER_PRESENTED');
    firstEventId = res.body.id as string;
  });

  it('replay do MESMO evento com mesma Idempotency-Key retorna mesmo id', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/scheduled-trips/${tripId}/events`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key1)
      .send({ type: 'DRIVER_PRESENTED', confidence: 'HIGH' })
      .expect(201);
    expect(res.body.id).toBe(firstEventId);
    expect(res.body.wasDeduped).toBe(true);
  });

  it('Idempotency-Key reusada para outro tipo de evento retorna 409', async () => {
    await request(app.getHttpServer())
      .post(`/v1/scheduled-trips/${tripId}/events`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key1)
      .send({ type: 'TRIP_STARTED', confidence: 'HIGH' })
      .expect(409);
  });

  it('TRIP_STARTED com nova chave move ScheduledTrip para IN_PROGRESS', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/scheduled-trips/${tripId}/events`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key2)
      .send({
        type: 'TRIP_STARTED',
        deviceTimestamp: new Date().toISOString(),
        latitude: -23.5,
        longitude: -46.6,
        precisionSeconds: 15,
        confidence: 'MEDIUM',
      })
      .expect(201);
    expect(res.body.tripExecutionState).toBe('IN_TRIP');

    const listed = await request(app.getHttpServer())
      .get(`/v1/scheduled-trips?date=${YEAR}-01-02`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const trip = listed.body.items.find((t: { id: string }) => t.id === tripId);
    expect(trip.state).toBe('IN_PROGRESS');
  });

  it('corrida: 5 submissões concorrentes do mesmo evento resultam em UM fato', async () => {
    const keyRace = `idem-${RUN_ID}-race`;
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .post(`/v1/scheduled-trips/${tripId}/events`)
          .set('Authorization', `Bearer ${token}`)
          .set('Idempotency-Key', keyRace)
          .send({ type: 'TRIP_ARRIVED', confidence: 'HIGH' }),
      ),
    );
    const ids = new Set(results.map((r) => r.body.id));
    expect(ids.size).toBe(1);
    for (const r of results) {
      expect(r.status).toBe(201);
    }
  });

  it('ausência de Idempotency-Key retorna 400', async () => {
    await request(app.getHttpServer())
      .post(`/v1/scheduled-trips/${tripId}/events`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'TRIP_COMPLETED' })
      .expect(400);
  });

  it('chave muito curta retorna 400', async () => {
    await request(app.getHttpServer())
      .post(`/v1/scheduled-trips/${tripId}/events`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'curta')
      .send({ type: 'TRIP_COMPLETED' })
      .expect(400);
  });
});
