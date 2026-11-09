/**
 * AT-04 — Jornada do motorista.
 *
 * O guard de compliance deve bloquear designações que extrapolem:
 *   - 10h de direção no mesmo dia-calendário (Lei do Motorista 13.103/2015)
 *   - 44h em janela deslizante de 7 dias (CLT art. 58)
 *
 * Estratégia: criamos duas rotas com múltiplos turnos, expandimos para a
 * janela de teste e reescrevemos os planos (plannedDeparture/Arrival) via
 * admin prisma para estressar os limites em janelas fixas. Dois motoristas
 * (um para dia, outro para semana) isolam os cenários.
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

// Driver A + rota com 3 turnos (cenário DIÁRIO).
let dailyDriverId: string;
let dailyVehicleId: string;
let dailyTripIds: { morning: string; lunch: string; night: string } = {
  morning: '',
  lunch: '',
  night: '',
};

// Driver B + rota com 1 turno/dia por 7 dias (cenário SEMANAL).
let weeklyDriverId: string;
let weeklyVehicleId: string;
const weeklyTripIds: string[] = []; // 6 trips, dias 10..15

// Driver C + rota com 2 turnos (cenário INTERJORNADA, dias 20 e 21).
let restDriverId: string;
let restVehicleId: string;
let restTripIds: { day20Night: string; day21Dawn: string; day21Morning: string } = {
  day20Night: '',
  day21Dawn: '',
  day21Morning: '',
};

const RUN_ID = Date.now();
// Ano distante dos outros arquivos E2E (AT-08 usa 2030..2080; AT-20 e
// AT-26 ficam no mesmo range). Aqui vamos para 2140+.
const YEAR = 2140 + (Math.floor(RUN_ID / 100) % 50);

function iso(y: number, m: number, d: number, hour: number, min = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, hour, min));
}

async function login(): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email: EMAIL, password: PASSWORD })
    .expect(200);
  return res.body.accessToken as string;
}

function randomPlate(prefix: string): string {
  const seed = Math.floor(Math.random() * 100);
  const n = String(seed).padStart(2, '0');
  return `${prefix}${seed % 10}${String.fromCharCode(65 + (seed % 26))}${n}`;
}

function cpfFor(offset: number): string {
  return String(Date.now() + offset).padStart(11, '0').slice(-11);
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
  const contractId: string = contract.id;

  // ---------- Rota do cenário diário (3 turnos) ---------------------------
  const DAILY_ROUTE = `R-AT04-DAY-${RUN_ID}`;
  const resRd = await request(app.getHttpServer())
    .post('/v1/routes')
    .set('Authorization', `Bearer ${token}`)
    .send({ contractId, code: DAILY_ROUTE, name: 'Rota diária AT-04', direction: 'IDA' })
    .expect(201);
  const dailyRouteId: string = resRd.body.id;

  const resVd = await request(app.getHttpServer())
    .post(`/v1/routes/${dailyRouteId}/versions`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      effectiveFrom: `${YEAR}-01-01`,
      targetArrivalOffsetMin: 10,
      maxWalkMeters: 500,
      stops: [
        { sequence: 1, name: 'A', latitude: -23.5, longitude: -46.6, offsetMinutes: -30 },
        { sequence: 2, name: 'B', latitude: -23.6, longitude: -46.7, offsetMinutes: 0 },
      ],
      turns: [
        { label: 'Manhã', targetArrivalTime: '06:00', daysOfWeek: [1, 2, 3, 4, 5, 6, 7] },
        { label: 'Almoço', targetArrivalTime: '13:00', daysOfWeek: [1, 2, 3, 4, 5, 6, 7] },
        { label: 'Noite', targetArrivalTime: '20:00', daysOfWeek: [1, 2, 3, 4, 5, 6, 7] },
      ],
    })
    .expect(201);
  const dailyVersionId: string = resVd.body.id;

  await request(app.getHttpServer())
    .post(`/v1/routes/${dailyRouteId}/versions/${dailyVersionId}/publish`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  await request(app.getHttpServer())
    .post(`/v1/routes/${dailyRouteId}/expand`)
    .set('Authorization', `Bearer ${token}`)
    .send({ fromDate: `${YEAR}-01-01`, toDate: `${YEAR}-01-01` })
    .expect(200);

  // Pega as 3 trips expandidas no dia 1 e reescreve as janelas para estressar o limite.
  const tripsDay1 = await prisma.scheduledTrip.findMany({
    where: { routeVersionId: dailyVersionId, operationalDate: new Date(`${YEAR}-01-01`) },
    include: { routeVersion: { include: { route: true } } },
    orderBy: { plannedDeparture: 'asc' },
  });
  // Esperamos 3 trips (manhã, almoço, noite). Reescreve janelas:
  //   Manhã: 06:00–13:00 UTC (7h)
  //   Almoço: 14:00–17:00 UTC (3h)  → 10h diários acumulados, passa
  //   Noite: 18:00–20:00 UTC (2h)  → tentativa de +2h sobre 10h = 12h, FALHA
  await prisma.scheduledTrip.update({
    where: { id: tripsDay1[0].id },
    data: { plannedDeparture: iso(YEAR, 1, 1, 6), plannedArrival: iso(YEAR, 1, 1, 13) },
  });
  await prisma.scheduledTrip.update({
    where: { id: tripsDay1[1].id },
    data: { plannedDeparture: iso(YEAR, 1, 1, 14), plannedArrival: iso(YEAR, 1, 1, 17) },
  });
  await prisma.scheduledTrip.update({
    where: { id: tripsDay1[2].id },
    data: { plannedDeparture: iso(YEAR, 1, 1, 18), plannedArrival: iso(YEAR, 1, 1, 20) },
  });
  dailyTripIds = {
    morning: tripsDay1[0].id,
    lunch: tripsDay1[1].id,
    night: tripsDay1[2].id,
  };

  // ---------- Rota do cenário semanal (1 turno × 7 dias) ------------------
  const WEEKLY_ROUTE = `R-AT04-WK-${RUN_ID}`;
  const resRw = await request(app.getHttpServer())
    .post('/v1/routes')
    .set('Authorization', `Bearer ${token}`)
    .send({ contractId, code: WEEKLY_ROUTE, name: 'Rota semanal AT-04', direction: 'IDA' })
    .expect(201);
  const weeklyRouteId: string = resRw.body.id;

  const resVw = await request(app.getHttpServer())
    .post(`/v1/routes/${weeklyRouteId}/versions`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      effectiveFrom: `${YEAR}-01-10`,
      targetArrivalOffsetMin: 10,
      maxWalkMeters: 500,
      stops: [
        { sequence: 1, name: 'A', latitude: -23.5, longitude: -46.6, offsetMinutes: -30 },
        { sequence: 2, name: 'B', latitude: -23.6, longitude: -46.7, offsetMinutes: 0 },
      ],
      turns: [{ label: 'Manhã', targetArrivalTime: '06:00', daysOfWeek: [1, 2, 3, 4, 5, 6, 7] }],
    })
    .expect(201);
  const weeklyVersionId: string = resVw.body.id;

  await request(app.getHttpServer())
    .post(`/v1/routes/${weeklyRouteId}/versions/${weeklyVersionId}/publish`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  await request(app.getHttpServer())
    .post(`/v1/routes/${weeklyRouteId}/expand`)
    .set('Authorization', `Bearer ${token}`)
    .send({ fromDate: `${YEAR}-01-10`, toDate: `${YEAR}-01-15` })
    .expect(200);

  // Reescreve as 6 trips para 8h/dia (06–14), EXCETO a última, que vira 5h (06–11).
  // Isso dá 5×8 = 40h nos 5 primeiros dias (ok), e a 6ª tentativa somará 45h na janela
  // deslizante de 7 dias terminando no fim da 6ª trip → FALHA weekly.
  const tripsWeek = await prisma.scheduledTrip.findMany({
    where: { routeVersionId: weeklyVersionId },
    orderBy: { operationalDate: 'asc' },
  });
  for (let i = 0; i < tripsWeek.length; i++) {
    const day = 10 + i;
    const endHour = i === 5 ? 11 : 14;
    await prisma.scheduledTrip.update({
      where: { id: tripsWeek[i].id },
      data: {
        plannedDeparture: iso(YEAR, 1, day, 6),
        plannedArrival: iso(YEAR, 1, day, endHour),
      },
    });
    weeklyTripIds.push(tripsWeek[i].id);
  }

  // ---------- Rota do cenário interjornada (2 turnos × 2 dias) ------------
  const REST_ROUTE = `R-AT05-${RUN_ID}`;
  const resRr = await request(app.getHttpServer())
    .post('/v1/routes')
    .set('Authorization', `Bearer ${token}`)
    .send({ contractId, code: REST_ROUTE, name: 'Rota AT-05', direction: 'IDA' })
    .expect(201);
  const restRouteId: string = resRr.body.id;

  const resVr = await request(app.getHttpServer())
    .post(`/v1/routes/${restRouteId}/versions`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      effectiveFrom: `${YEAR}-01-20`,
      targetArrivalOffsetMin: 10,
      maxWalkMeters: 500,
      stops: [
        { sequence: 1, name: 'A', latitude: -23.5, longitude: -46.6, offsetMinutes: -30 },
        { sequence: 2, name: 'B', latitude: -23.6, longitude: -46.7, offsetMinutes: 0 },
      ],
      turns: [
        { label: 'Manhã', targetArrivalTime: '06:00', daysOfWeek: [1, 2, 3, 4, 5, 6, 7] },
        { label: 'Noite', targetArrivalTime: '20:00', daysOfWeek: [1, 2, 3, 4, 5, 6, 7] },
      ],
    })
    .expect(201);
  const restVersionId: string = resVr.body.id;

  await request(app.getHttpServer())
    .post(`/v1/routes/${restRouteId}/versions/${restVersionId}/publish`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  await request(app.getHttpServer())
    .post(`/v1/routes/${restRouteId}/expand`)
    .set('Authorization', `Bearer ${token}`)
    .send({ fromDate: `${YEAR}-01-20`, toDate: `${YEAR}-01-21` })
    .expect(200);

  // 4 trips (2 por dia). Reescreve janelas:
  //   Day 20 Noite:   18:00-22:00 (fim da jornada do dia 20)
  //   Day 21 Madrug.: 02:00-04:00 (gap de 4h → INTERJOURNEY_REST)
  //   Day 21 Manhã:   10:00-14:00 (gap de 12h a partir do dia 20 → ok)
  //   Day 20 Manhã não será usada (deixamos existir, mas nenhum teste designa).
  const tripsRest = await prisma.scheduledTrip.findMany({
    where: { routeVersionId: restVersionId },
    orderBy: [{ operationalDate: 'asc' }, { plannedDeparture: 'asc' }],
  });
  // Ordem: [Day20-Manhã, Day20-Noite, Day21-Manhã, Day21-Noite]
  await prisma.scheduledTrip.update({
    where: { id: tripsRest[1].id },
    data: { plannedDeparture: iso(YEAR, 1, 20, 18), plannedArrival: iso(YEAR, 1, 20, 22) },
  });
  await prisma.scheduledTrip.update({
    where: { id: tripsRest[2].id },
    data: { plannedDeparture: iso(YEAR, 1, 21, 2), plannedArrival: iso(YEAR, 1, 21, 4) },
  });
  await prisma.scheduledTrip.update({
    where: { id: tripsRest[3].id },
    data: { plannedDeparture: iso(YEAR, 1, 21, 10), plannedArrival: iso(YEAR, 1, 21, 14) },
  });
  restTripIds = {
    day20Night: tripsRest[1].id,
    day21Dawn: tripsRest[2].id,
    day21Morning: tripsRest[3].id,
  };

  // ---------- Veículos + motoristas ---------------------------------------
  const resVehD = await request(app.getHttpServer())
    .post('/v1/vehicles')
    .set('Authorization', `Bearer ${token}`)
    .send({
      internalCode: `V-AT04-D-${RUN_ID}`,
      licensePlate: randomPlate('GHI'),
      category: 'BUS',
      seats: 44,
    })
    .expect(201);
  dailyVehicleId = resVehD.body.id;

  const resVehW = await request(app.getHttpServer())
    .post('/v1/vehicles')
    .set('Authorization', `Bearer ${token}`)
    .send({
      internalCode: `V-AT04-W-${RUN_ID}`,
      licensePlate: randomPlate('JKL'),
      category: 'BUS',
      seats: 44,
    })
    .expect(201);
  weeklyVehicleId = resVehW.body.id;

  const cpfD = cpfFor(0);
  const resDrvD = await request(app.getHttpServer())
    .post('/v1/drivers')
    .set('Authorization', `Bearer ${token}`)
    .send({
      fullName: 'Motorista Diário AT04',
      cpf: cpfD,
      license: {
        category: 'D',
        number: `CNH${cpfD}`,
        issuedAt: `${YEAR - 1}-01-01`,
        validUntil: `${YEAR + 5}-12-31`,
      },
    })
    .expect(201);
  dailyDriverId = resDrvD.body.id;

  const cpfW = cpfFor(1);
  const resDrvW = await request(app.getHttpServer())
    .post('/v1/drivers')
    .set('Authorization', `Bearer ${token}`)
    .send({
      fullName: 'Motorista Semanal AT04',
      cpf: cpfW,
      license: {
        category: 'D',
        number: `CNH${cpfW}`,
        issuedAt: `${YEAR - 1}-01-01`,
        validUntil: `${YEAR + 5}-12-31`,
      },
    })
    .expect(201);
  weeklyDriverId = resDrvW.body.id;

  const resVehR = await request(app.getHttpServer())
    .post('/v1/vehicles')
    .set('Authorization', `Bearer ${token}`)
    .send({
      internalCode: `V-AT05-${RUN_ID}`,
      licensePlate: randomPlate('MNO'),
      category: 'BUS',
      seats: 44,
    })
    .expect(201);
  restVehicleId = resVehR.body.id;

  const cpfR = cpfFor(2);
  const resDrvR = await request(app.getHttpServer())
    .post('/v1/drivers')
    .set('Authorization', `Bearer ${token}`)
    .send({
      fullName: 'Motorista Descanso AT05',
      cpf: cpfR,
      license: {
        category: 'D',
        number: `CNH${cpfR}`,
        issuedAt: `${YEAR - 1}-01-01`,
        validUntil: `${YEAR + 5}-12-31`,
      },
    })
    .expect(201);
  restDriverId = resDrvR.body.id;

  await prisma.$disconnect();
});

afterAll(async () => {
  await app?.close();
});

describe('AT-04 — jornada diária', () => {
  it('aceita 7h + 3h no mesmo dia (10h exatos, no limite)', async () => {
    await request(app.getHttpServer())
      .post(`/v1/scheduled-trips/${dailyTripIds.morning}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ vehicleId: dailyVehicleId, driverId: dailyDriverId })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/scheduled-trips/${dailyTripIds.lunch}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ vehicleId: dailyVehicleId, driverId: dailyDriverId })
      .expect(201);
  });

  it('rejeita o terceiro turno do mesmo dia (12h > 10h) com código estruturado', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/scheduled-trips/${dailyTripIds.night}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ vehicleId: dailyVehicleId, driverId: dailyDriverId })
      .expect(403);

    // A resposta carrega o motivo estruturado para o AutoDispatch poder sugerir
    // reatribuição em vez de só gritar.
    const body = res.body as { code?: string; violations?: unknown[] };
    expect(body.code).toBe('JOURNEY_DAILY_LIMIT');
    expect(Array.isArray(body.violations)).toBe(true);
  });
});

describe('AT-04 — jornada semanal (janela deslizante de 7 dias)', () => {
  it('aceita 5 dias × 8h (40h, abaixo do limite de 44h)', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post(`/v1/scheduled-trips/${weeklyTripIds[i]}/assignments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ vehicleId: weeklyVehicleId, driverId: weeklyDriverId })
        .expect(201);
    }
  });

  it('rejeita a 6ª designação (5h) que levaria a semana a 45h', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/scheduled-trips/${weeklyTripIds[5]}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ vehicleId: weeklyVehicleId, driverId: weeklyDriverId })
      .expect(403);

    const body = res.body as { code?: string };
    expect(body.code).toBe('JOURNEY_WEEKLY_LIMIT');
  });
});

describe('AT-05 — descanso interjornada (11h)', () => {
  it('aceita a jornada do dia 20 (18-22) como ponto de partida', async () => {
    await request(app.getHttpServer())
      .post(`/v1/scheduled-trips/${restTripIds.day20Night}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ vehicleId: restVehicleId, driverId: restDriverId })
      .expect(201);
  });

  it('rejeita jornada do dia 21 começando às 02:00 (gap 4h < 11h)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/scheduled-trips/${restTripIds.day21Dawn}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ vehicleId: restVehicleId, driverId: restDriverId })
      .expect(403);

    const body = res.body as { code?: string; violations?: { actualHours: number }[] };
    expect(body.code).toBe('INTERJOURNEY_REST');
    expect(body.violations?.[0]?.actualHours).toBe(4);
  });

  it('aceita jornada do dia 21 começando às 10:00 (gap 12h ≥ 11h)', async () => {
    await request(app.getHttpServer())
      .post(`/v1/scheduled-trips/${restTripIds.day21Morning}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ vehicleId: restVehicleId, driverId: restDriverId })
      .expect(201);
  });
});
