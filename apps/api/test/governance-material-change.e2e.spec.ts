/**
 * AT-04 oficial — alterar preço/beneficiário após pedido de aprovação
 * invalida a aprovação.
 *
 * Fluxo testado:
 *   1. admin cria um PayableInvoice via SQL (não há endpoint público
 *      standalone; AT-16 usa procurement).
 *   2. admin cria ApprovalRequest com snapshot do payable.
 *   3. SEM mudança, approver aprova → OK.
 *   4. admin cria OUTRO payable + outro ApprovalRequest.
 *   5. amountCents do payable é alterado por fora (simula ataque / erro).
 *   6. approver tenta APPROVE → 409 com code MATERIAL_CHANGED.
 *   7. Novo pedido com snapshot atualizado passa.
 *
 * Para RETURN e REJECT o check é pulado (aprovador tem direito de barrar
 * mesmo que o subject tenha mudado).
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

async function makePayable(
  amountCents: bigint,
  supplierName: string,
): Promise<{ id: string; snapshot: Record<string, unknown> }> {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL } },
  });
  const p = await prisma.payableInvoice.create({
    data: {
      tenantId,
      supplierName,
      description: `AT-04 oficial ${RUN_ID}`,
      amountCents,
      currency: 'BRL',
      issuedAt: new Date(),
      dueDate: new Date(),
      status: 'OPEN',
    },
  });
  await prisma.$disconnect();
  return {
    id: p.id,
    snapshot: {
      amountCents: p.amountCents.toString(),
      supplierName: p.supplierName,
      supplierCnpj: null,
      description: p.description,
      dueDate: p.dueDate.toISOString().slice(0, 10),
      classification: 'OPEX_OTHER',
    },
  };
}

async function patchPayableAmount(payableId: string, newAmount: bigint): Promise<void> {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL } },
  });
  await prisma.payableInvoice.update({
    where: { id: payableId },
    data: { amountCents: newAmount },
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

describe('AT-04 oficial — mudança material invalida aprovação', () => {
  it('sem mudança: admin cria pedido, approver aprova → APPROVED', async () => {
    const p = await makePayable(50_000n, `Fornecedor A ${RUN_ID}`);
    const createReq = await request(app.getHttpServer())
      .post('/v1/approvals')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        subjectType: 'payable_invoice',
        subjectId: p.id,
        subjectVersion: 1,
        reason: 'AT-04 happy path',
        requiredApprovals: 1,
        snapshot: p.snapshot,
        amountCents: 50000,
        currency: 'BRL',
      })
      .expect(201);

    const decide = await request(app.getHttpServer())
      .post(`/v1/approvals/${createReq.body.id}/decisions`)
      .set('Authorization', `Bearer ${tokenApprover}`)
      .send({ decision: 'APPROVE' })
      .expect(200);
    expect(decide.body.state).toBe('APPROVED');
  });

  it('COM mudança: aprovador recebe 409 MATERIAL_CHANGED', async () => {
    const p = await makePayable(100_000n, `Fornecedor B ${RUN_ID}`);
    const createReq = await request(app.getHttpServer())
      .post('/v1/approvals')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        subjectType: 'payable_invoice',
        subjectId: p.id,
        subjectVersion: 1,
        reason: 'AT-04 material-change path',
        requiredApprovals: 1,
        snapshot: p.snapshot,
        amountCents: 100000,
        currency: 'BRL',
      })
      .expect(201);

    // Alguém mexeu no payable DEPOIS do pedido.
    await patchPayableAmount(p.id, 250_000n);

    const res = await request(app.getHttpServer())
      .post(`/v1/approvals/${createReq.body.id}/decisions`)
      .set('Authorization', `Bearer ${tokenApprover}`)
      .send({ decision: 'APPROVE' })
      .expect(409);
    // Nest serializa ConflictException(objeto) como o próprio objeto no body.
    const body = res.body as { code?: string; subjectType?: string };
    expect(body.code).toBe('MATERIAL_CHANGED');
    expect(body.subjectType).toBe('payable_invoice');
  });

  it('REJECT continua passando mesmo com subject alterado (aprovador pode barrar)', async () => {
    const p = await makePayable(80_000n, `Fornecedor C ${RUN_ID}`);
    const createReq = await request(app.getHttpServer())
      .post('/v1/approvals')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        subjectType: 'payable_invoice',
        subjectId: p.id,
        subjectVersion: 1,
        reason: 'AT-04 reject-after-change',
        requiredApprovals: 1,
        snapshot: p.snapshot,
        amountCents: 80000,
        currency: 'BRL',
      })
      .expect(201);
    await patchPayableAmount(p.id, 999_999n);

    const res = await request(app.getHttpServer())
      .post(`/v1/approvals/${createReq.body.id}/decisions`)
      .set('Authorization', `Bearer ${tokenApprover}`)
      .send({ decision: 'REJECT', comment: 'valor suspeito' })
      .expect(200);
    expect(res.body.state).toBe('REJECTED');
  });

  it('novo pedido com snapshot atualizado passa', async () => {
    const p = await makePayable(60_000n, `Fornecedor D ${RUN_ID}`);
    const req1 = await request(app.getHttpServer())
      .post('/v1/approvals')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        subjectType: 'payable_invoice',
        subjectId: p.id,
        subjectVersion: 1,
        reason: 'AT-04 replay with fresh snapshot',
        requiredApprovals: 1,
        snapshot: p.snapshot,
        amountCents: 60000,
        currency: 'BRL',
      })
      .expect(201);
    await patchPayableAmount(p.id, 70_000n);

    // Pedido antigo fica inválido.
    await request(app.getHttpServer())
      .post(`/v1/approvals/${req1.body.id}/decisions`)
      .set('Authorization', `Bearer ${tokenApprover}`)
      .send({ decision: 'APPROVE' })
      .expect(409);

    // Cancela e cria um novo com snapshot atual.
    await request(app.getHttpServer())
      .delete(`/v1/approvals/${req1.body.id}?reason=substituido%20por%20pedido%20com%20valor%20novo`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);

    const freshSnapshot = { ...p.snapshot, amountCents: '70000' };
    const req2 = await request(app.getHttpServer())
      .post('/v1/approvals')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        subjectType: 'payable_invoice',
        subjectId: p.id,
        subjectVersion: 2,
        reason: 'AT-04 replay — snapshot refresh',
        requiredApprovals: 1,
        snapshot: freshSnapshot,
        amountCents: 70000,
        currency: 'BRL',
      })
      .expect(201);
    const resApprove = await request(app.getHttpServer())
      .post(`/v1/approvals/${req2.body.id}/decisions`)
      .set('Authorization', `Bearer ${tokenApprover}`)
      .send({ decision: 'APPROVE' })
      .expect(200);
    expect(resApprove.body.state).toBe('APPROVED');
  });
});
