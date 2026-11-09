/**
 * AT-05 oficial — SLA de plantão nunca aprova por silêncio.
 * AT-06 oficial — fracionamento para burlar alçada é detectado e bloqueado.
 *
 * AT-05:
 *   1. Pedido com slaMinutes=1. Esperar >1min simulado via SQL (backdating).
 *   2. Approver tenta APPROVE → 409 EXPIRED. Nunca APPROVED.
 *   3. REJECT continua passando mesmo depois do SLA (aprovador pode barrar).
 *   4. expire-stale varre PENDINGs vencidos e marca EXPIRED em lote.
 *
 * AT-06:
 *   1. Admin cria 3 pedidos consecutivos para o mesmo supplier (soma acima
 *      do threshold). O 3º é bloqueado com 409 FRACTIONATION_DETECTED.
 *   2. Pedido com supplier diferente passa normal.
 *   3. Pedido abaixo do threshold de soma passa.
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const { AppModule } = require('../dist/app.module.js') as { AppModule: unknown };

const PASSWORD = 'demo-password-only!';
const ADMIN = 'admin.pct@demo.gestlog.local';
const APPROVER = 'approver.pct@demo.gestlog.local';

let app: INestApplication;
let tokenAdmin: string;
let tokenApprover: string;
let tenantId: string;
const RUN_ID = Date.now();

async function login(email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return res.body.accessToken as string;
}

async function makePayable(amountCents: bigint, supplierName: string): Promise<string> {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL } },
  });
  const p = await prisma.payableInvoice.create({
    data: {
      tenantId,
      supplierName,
      description: `AT-05/06 ${RUN_ID}`,
      amountCents,
      currency: 'BRL',
      issuedAt: new Date(),
      dueDate: new Date(),
      status: 'OPEN',
    },
  });
  await prisma.$disconnect();
  return p.id as string;
}

async function backdate(approvalId: string, minutesAgo: number): Promise<void> {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL } },
  });
  const when = new Date(Date.now() - minutesAgo * 60_000);
  await prisma.approvalRequest.update({
    where: { id: approvalId },
    data: { createdAt: when },
  });
  await prisma.$disconnect();
}

beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const moduleRef = await Test.createTestingModule({ imports: [AppModule as any] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready', 'health/integrations'] });
  await app.init();
  tokenAdmin = await login(ADMIN);
  tokenApprover = await login(APPROVER);
  const me = await request(app.getHttpServer())
    .get('/v1/me')
    .set('Authorization', `Bearer ${tokenAdmin}`)
    .expect(200);
  tenantId = me.body.tenant.id as string;
});

afterAll(async () => {
  await app?.close();
});

describe('AT-05 oficial — SLA de plantão nunca aprova por silêncio', () => {
  it('APPROVE depois do SLA retorna 409 EXPIRED e marca o pedido como EXPIRED', async () => {
    const payableId = await makePayable(50_000n, `AT-05 supplier A ${RUN_ID}`);
    const createRes = await request(app.getHttpServer())
      .post('/v1/approvals')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        subjectType: 'payable_invoice',
        subjectId: payableId,
        subjectVersion: 1,
        reason: 'AT-05 SLA test',
        requiredApprovals: 1,
        slaMinutes: 1, // 1 minuto
        snapshot: {
          amountCents: '50000',
          supplierName: `AT-05 supplier A ${RUN_ID}`,
          supplierCnpj: null,
          description: `AT-05/06 ${RUN_ID}`,
          dueDate: new Date().toISOString().slice(0, 10),
          classification: 'OPEX_OTHER',
        },
        amountCents: 50000,
        currency: 'BRL',
      })
      .expect(201);
    // Simula tempo passado: backdating de 10 minutos.
    await backdate(createRes.body.id, 10);

    const res = await request(app.getHttpServer())
      .post(`/v1/approvals/${createRes.body.id}/decisions`)
      .set('Authorization', `Bearer ${tokenApprover}`)
      .send({ decision: 'APPROVE' })
      .expect(409);
    expect(res.body.code).toBe('EXPIRED');

    const detail = await request(app.getHttpServer())
      .get(`/v1/approvals/${createRes.body.id}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    expect(detail.body.state).toBe('EXPIRED');
  });

  it('REJECT depois do SLA continua passando (aprovador pode barrar)', async () => {
    const payableId = await makePayable(30_000n, `AT-05 supplier B ${RUN_ID}`);
    const createRes = await request(app.getHttpServer())
      .post('/v1/approvals')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        subjectType: 'payable_invoice',
        subjectId: payableId,
        subjectVersion: 1,
        reason: 'AT-05 reject-after-sla',
        requiredApprovals: 1,
        slaMinutes: 1,
        snapshot: {
          amountCents: '30000',
          supplierName: `AT-05 supplier B ${RUN_ID}`,
          supplierCnpj: null,
          description: `AT-05/06 ${RUN_ID}`,
          dueDate: new Date().toISOString().slice(0, 10),
          classification: 'OPEX_OTHER',
        },
        amountCents: 30000,
        currency: 'BRL',
      })
      .expect(201);
    await backdate(createRes.body.id, 10);

    const res = await request(app.getHttpServer())
      .post(`/v1/approvals/${createRes.body.id}/decisions`)
      .set('Authorization', `Bearer ${tokenApprover}`)
      .send({ decision: 'REJECT', comment: 'prazo passou e valor suspeito' })
      .expect(200);
    expect(res.body.state).toBe('REJECTED');
  });

  it('expire-stale varre pendentes vencidos e marca EXPIRED em lote', async () => {
    // Cria pedido e o backdates para passar do SLA.
    const payableId = await makePayable(40_000n, `AT-05 supplier C ${RUN_ID}`);
    const createRes = await request(app.getHttpServer())
      .post('/v1/approvals')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        subjectType: 'payable_invoice',
        subjectId: payableId,
        subjectVersion: 1,
        reason: 'AT-05 batch sweep',
        requiredApprovals: 1,
        slaMinutes: 5,
        snapshot: {
          amountCents: '40000',
          supplierName: `AT-05 supplier C ${RUN_ID}`,
          supplierCnpj: null,
          description: `AT-05/06 ${RUN_ID}`,
          dueDate: new Date().toISOString().slice(0, 10),
          classification: 'OPEX_OTHER',
        },
        amountCents: 40000,
        currency: 'BRL',
      })
      .expect(201);
    await backdate(createRes.body.id, 30);

    const res = await request(app.getHttpServer())
      .post('/v1/approvals/expire-stale')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    expect(res.body.expired).toBeGreaterThanOrEqual(1);

    const detail = await request(app.getHttpServer())
      .get(`/v1/approvals/${createRes.body.id}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    expect(detail.body.state).toBe('EXPIRED');
  });
});

describe('AT-06 oficial — fracionamento para burlar alçada', () => {
  const FRACTIONATION_SUPPLIER = `AT-06 supplier split ${RUN_ID}`;

  it('primeiros pedidos para o mesmo supplier passam (abaixo do threshold)', async () => {
    const p1 = await makePayable(400_000n, FRACTIONATION_SUPPLIER);
    await request(app.getHttpServer())
      .post('/v1/approvals')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        subjectType: 'payable_invoice',
        subjectId: p1,
        subjectVersion: 1,
        reason: 'AT-06 parcela 1',
        requiredApprovals: 1,
        snapshot: {
          amountCents: '400000',
          supplierName: FRACTIONATION_SUPPLIER,
          supplierCnpj: null,
          description: `AT-05/06 ${RUN_ID}`,
          dueDate: new Date().toISOString().slice(0, 10),
          classification: 'OPEX_OTHER',
        },
        amountCents: 400000,
        currency: 'BRL',
      })
      .expect(201);

    const p2 = await makePayable(400_000n, FRACTIONATION_SUPPLIER);
    await request(app.getHttpServer())
      .post('/v1/approvals')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        subjectType: 'payable_invoice',
        subjectId: p2,
        subjectVersion: 1,
        reason: 'AT-06 parcela 2',
        requiredApprovals: 1,
        snapshot: {
          amountCents: '400000',
          supplierName: FRACTIONATION_SUPPLIER,
          supplierCnpj: null,
          description: `AT-05/06 ${RUN_ID}`,
          dueDate: new Date().toISOString().slice(0, 10),
          classification: 'OPEX_OTHER',
        },
        amountCents: 400000,
        currency: 'BRL',
      })
      .expect(201);
  });

  it('terceiro pedido do mesmo supplier (soma 1.2M > threshold 1M) é 409 FRACTIONATION_DETECTED', async () => {
    const p3 = await makePayable(400_000n, FRACTIONATION_SUPPLIER);
    const res = await request(app.getHttpServer())
      .post('/v1/approvals')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        subjectType: 'payable_invoice',
        subjectId: p3,
        subjectVersion: 1,
        reason: 'AT-06 parcela 3 (fraciona)',
        requiredApprovals: 1,
        snapshot: {
          amountCents: '400000',
          supplierName: FRACTIONATION_SUPPLIER,
          supplierCnpj: null,
          description: `AT-05/06 ${RUN_ID}`,
          dueDate: new Date().toISOString().slice(0, 10),
          classification: 'OPEX_OTHER',
        },
        amountCents: 400000,
        currency: 'BRL',
      })
      .expect(409);
    expect(res.body.code).toBe('FRACTIONATION_DETECTED');
    expect(Number(res.body.totalCents)).toBeGreaterThan(Number(res.body.thresholdCents));
    expect(Array.isArray(res.body.peerRequestIds)).toBe(true);
  });

  it('supplier diferente passa no mesmo valor', async () => {
    const other = `AT-06 supplier other ${RUN_ID}`;
    const pOther = await makePayable(900_000n, other);
    await request(app.getHttpServer())
      .post('/v1/approvals')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        subjectType: 'payable_invoice',
        subjectId: pOther,
        subjectVersion: 1,
        reason: 'AT-06 outro fornecedor',
        requiredApprovals: 1,
        snapshot: {
          amountCents: '900000',
          supplierName: other,
          supplierCnpj: null,
          description: `AT-05/06 ${RUN_ID}`,
          dueDate: new Date().toISOString().slice(0, 10),
          classification: 'OPEX_OTHER',
        },
        amountCents: 900000,
        currency: 'BRL',
      })
      .expect(201);
  });
});
