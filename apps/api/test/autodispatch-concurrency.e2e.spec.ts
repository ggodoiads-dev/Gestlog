/**
 * AT-08 — Designação atômica.
 *
 * Dois dispatchers tentam designar simultaneamente o mesmo motorista
 * e veículo para a MESMA ScheduledTrip. A invariante é que apenas UMA
 * designação viva por trip pode existir; a segunda tentativa recebe
 * 409 Conflict. Garantida por índice único parcial no banco.
 *
 * Também cobre:
 *   - Elegibilidade do veículo (não designa se operationalStatus=BLOCKED)
 *   - Elegibilidade do motorista (habilitação vencida bloqueia)
 *   - Cancelamento libera a vaga; nova designação pode ocorrer
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
let routeId: string;
let routeVersionId: string;
let tripId: string;
let vehicleId: string;
let driverId: string;
let blockedVehicleId: string;
let expiredLicenseDriverId: string;

// Cada run do teste trabalha em um ano próprio e com um código de rota
// com timestamp — evita colisão tanto com outros arquivos E2E quanto com
// execuções anteriores que deixaram dados no banco.
const YEAR = 2030 + (process.pid % 50);
const RUN_ID = Date.now();
const ROUTE_CODE = `R-AT08-${RUN_ID}`;
const d = (dayOfMonth: number): string =>
  `${YEAR}-01-${String(dayOfMonth).padStart(2, '0')}`;

async function freshTripId(date: string): Promise<string> {
  const resList = await request(app.getHttpServer())
    .get(`/v1/scheduled-trips?date=${date}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const item = resList.body.items.find(
    (t: { routeCode: string }) => t.routeCode === ROUTE_CODE,
  );
  if (!item) throw new Error(`nenhuma trip de ${ROUTE_CODE} em ${date}`);
  return item.id;
}

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

  // ---------- Setup compartilhado: rota publicada + viagens ---------------
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL } },
  });
  const contract = await prisma.contract.findFirst({ where: { code: 'CTR-ALP-001' } });
  contractId = contract.id;
  await prisma.$disconnect();

  const resR = await request(app.getHttpServer())
    .post('/v1/routes')
    .set('Authorization', `Bearer ${token}`)
    .send({ contractId, code: ROUTE_CODE, name: 'Rota AT-08', direction: 'IDA' })
    .expect(201);
  routeId = resR.body.id;

  const resV = await request(app.getHttpServer())
    .post(`/v1/routes/${routeId}/versions`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      effectiveFrom: `${YEAR}-01-01`,
      targetArrivalOffsetMin: 10,
      maxWalkMeters: 500,
      stops: [
        { sequence: 1, name: 'A', latitude: -23.5, longitude: -46.6, offsetMinutes: -40 },
        { sequence: 2, name: 'B', latitude: -23.6, longitude: -46.7, offsetMinutes: 0 },
      ],
      turns: [{ label: 'Manhã', targetArrivalTime: '06:00', daysOfWeek: [1, 2, 3, 4, 5, 6, 7] }],
    })
    .expect(201);
  routeVersionId = resV.body.id;

  await request(app.getHttpServer())
    .post(`/v1/routes/${routeId}/versions/${routeVersionId}/publish`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  await request(app.getHttpServer())
    .post(`/v1/routes/${routeId}/expand`)
    .set('Authorization', `Bearer ${token}`)
    .send({ fromDate: d(2), toDate: d(15) })
    .expect(200);

  tripId = await freshTripId(d(2));

  // Placas Mercosul únicas por run: 3 letras + 1 número + 1 letra + 2 números.
  const randomPlate = (prefix: string): string => {
    const seed = Math.floor(Math.random() * 100);
    const n = String(seed).padStart(2, '0');
    return `${prefix}${seed % 10}${String.fromCharCode(65 + (seed % 26))}${n}`;
  };

  const resVeh = await request(app.getHttpServer())
    .post('/v1/vehicles')
    .set('Authorization', `Bearer ${token}`)
    .send({
      internalCode: `V-AT08-OK-${RUN_ID}`,
      licensePlate: randomPlate('ABC'),
      chassis: `9BW${String(RUN_ID).slice(-14).toUpperCase().padStart(14, '0')}`.slice(0, 17),
      category: 'BUS',
      seats: 44,
      modelName: 'Marcopolo',
      modelYear: 2022,
    })
    .expect(201);
  vehicleId = resVeh.body.id;

  // Veículo bloqueado (via SQL: ainda não há endpoint de mudança de status).
  const resVeh2 = await request(app.getHttpServer())
    .post('/v1/vehicles')
    .set('Authorization', `Bearer ${token}`)
    .send({
      internalCode: `V-AT08-BLK-${RUN_ID}`,
      licensePlate: randomPlate('DEF'),
      category: 'BUS',
    })
    .expect(201);
  blockedVehicleId = resVeh2.body.id;

  const prisma2 = new (require('@prisma/client').PrismaClient)({
    datasources: { db: { url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL } },
  });
  await prisma2.vehicle.update({
    where: { id: blockedVehicleId },
    data: { operationalStatus: 'BLOCKED' },
  });
  await prisma2.vehicleEligibilityProjection.update({
    where: { vehicleId: blockedVehicleId },
    data: {
      isEligible: false,
      reasons: [{ code: 'blocked', message: 'veículo bloqueado administrativamente', severity: 'block' }],
      computedAt: new Date(),
    },
  });
  await prisma2.$disconnect();

  // Motorista elegível — validade cobre a janela YYYY-01.
  const cpf1 = String(Date.now()).padStart(11, '0').slice(-11);
  const resDrv = await request(app.getHttpServer())
    .post('/v1/drivers')
    .set('Authorization', `Bearer ${token}`)
    .send({
      fullName: 'Motorista AT08',
      cpf: cpf1,
      license: {
        category: 'D',
        number: `CNH${cpf1}`,
        issuedAt: `${YEAR - 1}-01-01`,
        validUntil: `${YEAR + 5}-12-31`,
      },
    })
    .expect(201);
  driverId = resDrv.body.id;

  // Motorista com habilitação vencida
  const cpf2 = String(Date.now() + 1).padStart(11, '0').slice(-11);
  const resDrv2 = await request(app.getHttpServer())
    .post('/v1/drivers')
    .set('Authorization', `Bearer ${token}`)
    .send({
      fullName: 'Motorista Vencido',
      cpf: cpf2,
      license: {
        category: 'D',
        number: `CNH${cpf2}`,
        issuedAt: '2015-01-01',
        validUntil: '2020-12-31',
      },
    })
    .expect(201);
  expiredLicenseDriverId = resDrv2.body.id;
});

afterAll(async () => {
  await app?.close();
});

describe('AT-08 — designação atômica e elegibilidade', () => {
  it('designação válida cria PROPOSED e muda state da trip para ASSIGNED', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/scheduled-trips/${tripId}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ vehicleId, driverId, requiredLicenseCategories: ['D', 'E'] })
      .expect(201);
    expect(res.body.state).toBe('PROPOSED');
    expect(res.body.scheduledTripId).toBe(tripId);

    const resList = await request(app.getHttpServer())
      .get(`/v1/scheduled-trips?date=${d(2)}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const trip = resList.body.items.find((t: { id: string }) => t.id === tripId);
    expect(trip.state).toBe('ASSIGNED');
  });

  it('segunda designação para a mesma trip retorna 409 (invariante de banco)', async () => {
    await request(app.getHttpServer())
      .post(`/v1/scheduled-trips/${tripId}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ vehicleId, driverId })
      .expect(409);
  });

  it('duas tentativas EM PARALELO para uma trip limpa: exatamente uma vence', async () => {
    const freshTrip = await freshTripId(d(3));

    const [r1, r2] = await Promise.all([
      request(app.getHttpServer())
        .post(`/v1/scheduled-trips/${freshTrip}/assignments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ vehicleId, driverId }),
      request(app.getHttpServer())
        .post(`/v1/scheduled-trips/${freshTrip}/assignments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ vehicleId, driverId }),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 409]);
  });

  it('cancelar designação libera a vaga; nova designação pode ocorrer', async () => {
    const trip = await freshTripId(d(4));

    const r1 = await request(app.getHttpServer())
      .post(`/v1/scheduled-trips/${trip}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ vehicleId, driverId })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/v1/assignments/${r1.body.id}?reason=${encodeURIComponent('troca de equipe')}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Segunda designação agora deve passar (não há mais assignment vivo).
    await request(app.getHttpServer())
      .post(`/v1/scheduled-trips/${trip}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ vehicleId, driverId })
      .expect(201);
  });

  it('veículo BLOQUEADO não pode ser designado (403)', async () => {
    const trip = await freshTripId(d(5));

    await request(app.getHttpServer())
      .post(`/v1/scheduled-trips/${trip}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ vehicleId: blockedVehicleId, driverId })
      .expect(403);
  });

  it('motorista com habilitação VENCIDA não pode ser designado (403)', async () => {
    const trip = await freshTripId(d(6));

    await request(app.getHttpServer())
      .post(`/v1/scheduled-trips/${trip}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ vehicleId, driverId: expiredLicenseDriverId })
      .expect(403);
  });
});
