/**
 * Fuel: AT-13, AT-14, AT-15.
 *
 * AT-13 — Compra credita o tanque; abastecimento do veículo debita. São
 *         operações independentes. O extrato do tanque lista cada uma com
 *         seu tipo.
 * AT-14 — Compra ordinária acima do limite exige aprovação prévia (bloqueia
 *         com 403). Compra emergencial acima do limite nasce
 *         PENDING_APPROVAL e NÃO entra no saldo até ser aprovada. SoD:
 *         quem pediu não aprova (herdado do AT-03).
 * AT-15 — Transferência entre tanques é operação dupla atômica; conserva o
 *         volume total; não gera compra nova.
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const { AppModule } = require('../dist/app.module.js') as { AppModule: unknown };

const ADMIN_EMAIL = 'admin.pct@demo.gestlog.local';
const APPROVER_EMAIL = 'approver.pct@demo.gestlog.local';
const PASSWORD = 'demo-password-only!';

let app: INestApplication;
let adminToken: string;
let approverToken: string;

let tankAId: string;
let tankBId: string;

const RUN_ID = Date.now();
const CODE_A = `T-A-${RUN_ID}`;
const CODE_B = `T-B-${RUN_ID}`;

async function login(email: string, password: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return res.body.accessToken as string;
}

function iso(y: number, m: number, d: number, h = 12): string {
  return new Date(Date.UTC(y, m - 1, d, h)).toISOString();
}

beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const moduleRef = await Test.createTestingModule({ imports: [AppModule as any] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready', 'health/integrations'] });
  await app.init();
  adminToken = await login(ADMIN_EMAIL, PASSWORD);
  approverToken = await login(APPROVER_EMAIL, PASSWORD);

  const resA = await request(app.getHttpServer())
    .post('/v1/fuel/tanks')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      code: CODE_A,
      name: 'Tanque A (garagem central)',
      product: 'DIESEL_S10',
      capacityMl: 15_000_000, // 15.000 L
    })
    .expect(201);
  tankAId = resA.body.id;

  const resB = await request(app.getHttpServer())
    .post('/v1/fuel/tanks')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      code: CODE_B,
      name: 'Tanque B (filial)',
      product: 'DIESEL_S10',
      capacityMl: 10_000_000,
    })
    .expect(201);
  tankBId = resB.body.id;
});

afterAll(async () => {
  await app?.close();
});

describe('AT-13 — compra ≠ abastecimento', () => {
  it('compra ordinária CONFIRMED entra no saldo do tanque', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/fuel/tanks/${tankAId}/purchases`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplierName: 'Petrobras Distribuidora',
        quantityMl: 5_000_000, // 5.000 L
        totalCostCents: 90000, // R$ 900,00 — abaixo do limite
        purchasedAt: iso(2135, 3, 1),
      })
      .expect(201);
    expect(res.body.status).toBe('CONFIRMED');
  });

  it('listagem mostra saldo de 5.000.000 ml no tanque A', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/fuel/tanks')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const tank = (res.body.items as { id: string; balanceMl: string }[]).find(
      (t) => t.id === tankAId,
    );
    expect(tank?.balanceMl).toBe('5000000');
  });

  it('abastecer veículo debita o tanque e grava fill separado', async () => {
    // Usa veículo qualquer do tenant; se não tiver, cria um.
    const list = await request(app.getHttpServer())
      .get('/v1/vehicles')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    let vehicleId: string | undefined = list.body.items[0]?.id;
    if (!vehicleId) {
      const seed = Math.floor(Math.random() * 100);
      const plate = `XYZ${seed % 10}${String.fromCharCode(65 + (seed % 26))}${String(seed).padStart(2, '0')}`;
      const resV = await request(app.getHttpServer())
        .post('/v1/vehicles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          internalCode: `V-AT13-${RUN_ID}`,
          licensePlate: plate,
          category: 'BUS',
        })
        .expect(201);
      vehicleId = resV.body.id as string;
    }

    const res = await request(app.getHttpServer())
      .post(`/v1/fuel/tanks/${tankAId}/fills`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        vehicleId,
        quantityMl: 200_000, // 200 L
        odometerKm: 120_500,
        filledAt: iso(2135, 3, 2),
      })
      .expect(201);
    expect(res.body.tankBalanceMl).toBe('4800000');
  });

  it('extrato do tanque lista PURCHASE e FILL como linhas distintas', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/fuel/tanks/${tankAId}/statement`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const kinds = (res.body.entries as { kind: string }[]).map((e) => e.kind);
    expect(kinds).toContain('PURCHASE');
    expect(kinds).toContain('FILL');
    expect(res.body.tank.balanceMl).toBe('4800000');
  });

  it('abastecer além do saldo é bloqueado (409)', async () => {
    const list = await request(app.getHttpServer())
      .get('/v1/vehicles')
      .set('Authorization', `Bearer ${adminToken}`);
    const vehicleId = list.body.items[0].id as string;
    await request(app.getHttpServer())
      .post(`/v1/fuel/tanks/${tankAId}/fills`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        vehicleId,
        quantityMl: 10_000_000, // mais do que há
        filledAt: iso(2135, 3, 3),
      })
      .expect(409);
  });
});

describe('AT-14 — compra emergencial com estado PENDING_APPROVAL', () => {
  let pendingId: string;

  it('compra ORDINÁRIA acima do limite sem emergency=true é 403', async () => {
    await request(app.getHttpServer())
      .post(`/v1/fuel/tanks/${tankAId}/purchases`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplierName: 'Posto Rodoviário Fácil',
        quantityMl: 2_000_000,
        totalCostCents: 500000, // R$ 5.000 — acima do limite
        purchasedAt: iso(2135, 3, 5),
      })
      .expect(403);
  });

  it('compra EMERGENCIAL acima do limite cria registro PENDING_APPROVAL sem entrar no saldo', async () => {
    const before = await request(app.getHttpServer())
      .get('/v1/fuel/tanks')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const beforeBalance = (before.body.items as { id: string; balanceMl: string }[]).find(
      (t) => t.id === tankAId,
    )?.balanceMl;

    const res = await request(app.getHttpServer())
      .post(`/v1/fuel/tanks/${tankAId}/purchases`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplierName: 'Posto Rodoviário Fácil',
        quantityMl: 2_000_000,
        totalCostCents: 500000,
        purchasedAt: iso(2135, 3, 5),
        emergency: true,
        reason: 'motorista ficou sem combustível na rodovia',
      })
      .expect(201);
    expect(res.body.status).toBe('PENDING_APPROVAL');
    pendingId = res.body.id as string;

    const after = await request(app.getHttpServer())
      .get('/v1/fuel/tanks')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const afterBalance = (after.body.items as { id: string; balanceMl: string }[]).find(
      (t) => t.id === tankAId,
    )?.balanceMl;
    expect(afterBalance).toBe(beforeBalance);
  });

  it('autoaprovação proibida (quem pediu não aprova)', async () => {
    await request(app.getHttpServer())
      .post(`/v1/fuel/purchases/${pendingId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
  });

  it('aprovação por outro usuário com alçada move para CONFIRMED e soma no saldo', async () => {
    const before = await request(app.getHttpServer())
      .get('/v1/fuel/tanks')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const beforeBalance = BigInt(
      (before.body.items as { id: string; balanceMl: string }[]).find((t) => t.id === tankAId)
        ?.balanceMl ?? '0',
    );

    const res = await request(app.getHttpServer())
      .post(`/v1/fuel/purchases/${pendingId}/approve`)
      .set('Authorization', `Bearer ${approverToken}`)
      .expect(201);
    expect(res.body.status).toBe('CONFIRMED');

    const after = await request(app.getHttpServer())
      .get('/v1/fuel/tanks')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const afterBalance = BigInt(
      (after.body.items as { id: string; balanceMl: string }[]).find((t) => t.id === tankAId)
        ?.balanceMl ?? '0',
    );
    expect(afterBalance - beforeBalance).toBe(2_000_000n);
  });
});

describe('AT-15 — transferência preserva volume total', () => {
  it('transferência A → B debita A e credita B atomicamente', async () => {
    const before = await request(app.getHttpServer())
      .get('/v1/fuel/tanks')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const map = new Map(
      (before.body.items as { id: string; balanceMl: string }[]).map((t) => [t.id, BigInt(t.balanceMl)]),
    );
    const totalBefore = (map.get(tankAId) ?? 0n) + (map.get(tankBId) ?? 0n);

    const res = await request(app.getHttpServer())
      .post('/v1/fuel/transfers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fromTankId: tankAId,
        toTankId: tankBId,
        quantityMl: 1_000_000,
        transferredAt: iso(2135, 3, 6),
        reason: 'reequilibrar estoque antes do feriado',
      })
      .expect(201);
    expect(BigInt(res.body.fromBalanceMl)).toBe((map.get(tankAId) ?? 0n) - 1_000_000n);
    expect(BigInt(res.body.toBalanceMl)).toBe((map.get(tankBId) ?? 0n) + 1_000_000n);

    const after = await request(app.getHttpServer())
      .get('/v1/fuel/tanks')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const mapAfter = new Map(
      (after.body.items as { id: string; balanceMl: string }[]).map((t) => [t.id, BigInt(t.balanceMl)]),
    );
    const totalAfter = (mapAfter.get(tankAId) ?? 0n) + (mapAfter.get(tankBId) ?? 0n);
    expect(totalAfter).toBe(totalBefore);
  });

  it('transferência de tanque para si mesmo é 400', async () => {
    await request(app.getHttpServer())
      .post('/v1/fuel/transfers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fromTankId: tankAId,
        toTankId: tankAId,
        quantityMl: 100_000,
        transferredAt: iso(2135, 3, 7),
      })
      .expect(400);
  });

  it('transferência além do saldo da origem é 409', async () => {
    await request(app.getHttpServer())
      .post('/v1/fuel/transfers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fromTankId: tankBId,
        toTankId: tankAId,
        quantityMl: 50_000_000,
        transferredAt: iso(2135, 3, 8),
      })
      .expect(409);
  });
});
