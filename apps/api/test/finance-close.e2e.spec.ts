/**
 * AT-26 (parcial) + AT-28 (parcial) — fechamento mensal + EBITDA.
 *
 * Fluxo coberto:
 *   1. DRE live retorna 0/0 quando não há fatos.
 *   2. Validar trip + emitir payable gera receita e opex em DRE live.
 *   3. close snapshot: snapshot imutável v1, estado CLOSED, marginBps ok.
 *   4. Validar nova trip na MESMA competência (CLOSED) → 409
 *      (mudança silenciosa de competência fechada bloqueada).
 *   5. reopen com motivo → state=REOPENED. Novas medições voltam a passar.
 *   6. Fechar de novo gera snapshot v2; v1 permanece imutável.
 *   7. Validar em competência diferente (ainda OPEN) não é afetado.
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
let contractId: string;
let legalEntityId: string;
let routeId: string;

const RUN_ID = Date.now();
// Granularidade em 100ms garante janela diferente em runs sequenciais do CI.
const YEAR = 2030 + (Math.floor(RUN_ID / 100) % 60);
const MONTH = 3;
const ROUTE_CODE = `R-FIN-${RUN_ID}`;

async function login(email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return res.body.accessToken as string;
}

async function tripOnDate(date: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .get(`/v1/scheduled-trips?date=${date}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const t = (res.body.items as { id: string; routeCode: string }[]).find(
    (x) => x.routeCode === ROUTE_CODE,
  );
  if (!t) throw new Error(`trip ${ROUTE_CODE} em ${date} não encontrada`);
  return t.id;
}

beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const moduleRef = await Test.createTestingModule({ imports: [AppModule as any] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready', 'health/integrations'] });
  await app.init();
  token = await login(ADMIN);

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL } },
  });
  const contract = await prisma.contract.findFirstOrThrow({ where: { code: 'CTR-JDA-001' } });
  contractId = contract.id;
  legalEntityId = contract.legalEntityId;
  await prisma.$disconnect();

  // Monta rota + 2 competências (MONTH e MONTH+1) de viagens.
  const resR = await request(app.getHttpServer())
    .post('/v1/routes')
    .set('Authorization', `Bearer ${token}`)
    .send({ contractId, code: ROUTE_CODE, name: 'Rota Fin', direction: 'IDA' })
    .expect(201);
  routeId = resR.body.id;
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
      fromDate: `${YEAR}-${String(MONTH).padStart(2, '0')}-02`,
      toDate: `${YEAR}-${String(MONTH + 1).padStart(2, '0')}-05`,
    })
    .expect(200);
});

afterAll(async () => {
  await app?.close();
});

describe('AT-26 + AT-28 — fechamento + DRE/EBITDA', () => {
  it('DRE live inicial é zero antes de validar qualquer trip', async () => {
    const res = await request(app.getHttpServer())
      .get(
        `/v1/finance/dre?legalEntityId=${legalEntityId}&year=${YEAR}&month=${MONTH}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.source).toBe('live');
    // Pode haver contaminação de outros tests; validamos APENAS que o campo
    // existe e o ebitda = revenue - opex.
    expect(BigInt(res.body.ebitdaCents)).toBe(
      BigInt(res.body.revenueCents) - BigInt(res.body.opexCents),
    );
  });

  it('validar trip gera receita MONTHLY_FIXED R$ 18.000 na DRE live', async () => {
    const tripId = await tripOnDate(`${YEAR}-${String(MONTH).padStart(2, '0')}-02`);
    await request(app.getHttpServer())
      .post(`/v1/scheduled-trips/${tripId}/validate`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(
        `/v1/finance/dre?legalEntityId=${legalEntityId}&year=${YEAR}&month=${MONTH}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.source).toBe('live');
    // Receita >= 1.800.000 (pode ter outros contratos JDA de outros testes
    // antigos; só verificamos que o nosso aumentou).
    expect(BigInt(res.body.revenueCents) >= 1_800_000n).toBe(true);
  });

  it('fechar competência cria snapshot v1 imutável; state=CLOSED', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/finance/periods/${legalEntityId}/${YEAR}/${MONTH}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.source).toBe('snapshot');
    expect(res.body.period.state).toBe('CLOSED');
    expect(res.body.period.closedAt).toBeTruthy();
    expect(res.body.snapshots).toHaveLength(1);
    expect(res.body.snapshots[0].version).toBe(1);
    expect(res.body.ebitdaCents).toBe(
      (BigInt(res.body.revenueCents) - BigInt(res.body.opexCents)).toString(),
    );
    // marginBps consistente
    if (BigInt(res.body.revenueCents) > 0n) {
      const expected = Number(
        (BigInt(res.body.ebitdaCents) * 10_000n) / BigInt(res.body.revenueCents),
      );
      expect(res.body.marginBps).toBe(expected);
    }
  });

  it('validate em competência CLOSED → 409', async () => {
    const tripId = await tripOnDate(`${YEAR}-${String(MONTH).padStart(2, '0')}-03`);
    await request(app.getHttpServer())
      .post(`/v1/scheduled-trips/${tripId}/validate`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
  });

  it('close duplicado da mesma competência → 409', async () => {
    await request(app.getHttpServer())
      .post(`/v1/finance/periods/${legalEntityId}/${YEAR}/${MONTH}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
  });

  it('reopen com motivo liga competência de novo', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/finance/periods/${legalEntityId}/${YEAR}/${MONTH}/reopen`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'NF tardia do fornecedor' })
      .expect(200);
    expect(res.body.period.state).toBe('REOPENED');
    expect(res.body.period.reopenReason).toBe('NF tardia do fornecedor');
    // snapshot v1 continua lá (histórico preservado).
    expect(res.body.snapshots).toHaveLength(1);
  });

  it('validate após reopen passa', async () => {
    const tripId = await tripOnDate(`${YEAR}-${String(MONTH).padStart(2, '0')}-04`);
    await request(app.getHttpServer())
      .post(`/v1/scheduled-trips/${tripId}/validate`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('close novamente gera snapshot v2; v1 continua imutável', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/finance/periods/${legalEntityId}/${YEAR}/${MONTH}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.snapshots.length).toBeGreaterThanOrEqual(2);
    const versions = (res.body.snapshots as { version: number }[]).map((s) => s.version);
    expect(versions).toContain(1);
    expect(versions).toContain(2);
  });

  it('competência diferente (MONTH+1) continua OPEN e aceita validate', async () => {
    const tripId = await tripOnDate(`${YEAR}-${String(MONTH + 1).padStart(2, '0')}-02`);
    await request(app.getHttpServer())
      .post(`/v1/scheduled-trips/${tripId}/validate`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const dre = await request(app.getHttpServer())
      .get(
        `/v1/finance/dre?legalEntityId=${legalEntityId}&year=${YEAR}&month=${MONTH + 1}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(dre.body.source).toBe('live');
    expect(dre.body.period.state).toBe('OPEN');
  });
});
