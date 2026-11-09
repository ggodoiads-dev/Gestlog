/**
 * AT-02 + AT-03 — autoridade real e sem autoaprovação.
 *
 * Três usuários no mesmo tenant:
 *   - admin.pct       (tenant_admin, pode criar E decidir)
 *   - approver.pct    (finance_approver, pode decidir, NÃO cria)
 *   - viewer.pct      (viewer, só lê — não decide)
 *
 * Cenários:
 *   1. Viewer tentando decidir -> 403 (guard de permissão).
 *   2. Solicitante (admin) tentando decidir seu próprio pedido -> 403
 *      (SoD / sem autoaprovação).
 *   3. Aprovador INDEPENDENTE decide -> pedido vira APPROVED.
 *   4. Segunda decisão no mesmo pedido -> 409.
 *   5. Replay (mesmo aprovador vota 2x) -> 409.
 *   6. REJECT por qualquer aprovador fecha para REJECTED imediatamente.
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const { AppModule } = require('../dist/app.module.js') as { AppModule: unknown };

const PASSWORD = 'demo-password-only!';
const ADMIN = 'admin.pct@demo.gestlog.local';
const APPROVER = 'approver.pct@demo.gestlog.local';
const VIEWER = 'viewer.pct@demo.gestlog.local';

let app: INestApplication;
let tokenAdmin: string;
let tokenApprover: string;
let tokenViewer: string;
const RUN_ID = Date.now();

async function login(email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return res.body.accessToken as string;
}

async function createApproval(subjectId: string, reason: string, requiredApprovals = 1) {
  const res = await request(app.getHttpServer())
    .post('/v1/approvals')
    .set('Authorization', `Bearer ${tokenAdmin}`)
    .send({
      subjectType: 'payment',
      subjectId,
      reason,
      amountCents: '1500000',
      currency: 'BRL',
      requiredApprovals,
      snapshot: { amountCents: '1500000', beneficiary: 'DEMO' },
    })
    .expect(201);
  return res.body.id as string;
}

beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const moduleRef = await Test.createTestingModule({ imports: [AppModule as any] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready', 'health/integrations'] });
  await app.init();
  [tokenAdmin, tokenApprover, tokenViewer] = await Promise.all([
    login(ADMIN),
    login(APPROVER),
    login(VIEWER),
  ]);
});

afterAll(async () => {
  await app?.close();
});

describe('AT-02 + AT-03 — governança de aprovações', () => {
  it('viewer (sem permissão governance.approvals.decide) recebe 403', async () => {
    const subjectId = `00000000-0000-0000-0000-${String(RUN_ID).padStart(12, '0').slice(-12)}`;
    const approvalId = await createApproval(subjectId, 'pagamento de teste viewer');
    await request(app.getHttpServer())
      .post(`/v1/approvals/${approvalId}/decisions`)
      .set('Authorization', `Bearer ${tokenViewer}`)
      .send({ decision: 'APPROVE' })
      .expect(403);
  });

  it('solicitante NÃO pode decidir seu próprio pedido (403)', async () => {
    const subjectId = `00000000-0000-0000-0001-${String(RUN_ID).padStart(12, '0').slice(-12)}`;
    const approvalId = await createApproval(subjectId, 'pagamento autoaprovado?');
    await request(app.getHttpServer())
      .post(`/v1/approvals/${approvalId}/decisions`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ decision: 'APPROVE', comment: 'eu mesmo' })
      .expect(403);
  });

  it('aprovador INDEPENDENTE pode aprovar; pedido vira APPROVED', async () => {
    const subjectId = `00000000-0000-0000-0002-${String(RUN_ID).padStart(12, '0').slice(-12)}`;
    const approvalId = await createApproval(subjectId, 'pagamento regular');

    const res = await request(app.getHttpServer())
      .post(`/v1/approvals/${approvalId}/decisions`)
      .set('Authorization', `Bearer ${tokenApprover}`)
      .send({ decision: 'APPROVE', comment: 'ok' })
      .expect(200);
    expect(res.body.state).toBe('APPROVED');
    expect(res.body.approvalsReceived).toBe(1);
    expect(res.body.decidedAt).toBeTruthy();
  });

  it('decisão em pedido já finalizado -> 409', async () => {
    const subjectId = `00000000-0000-0000-0003-${String(RUN_ID).padStart(12, '0').slice(-12)}`;
    const approvalId = await createApproval(subjectId, 'ja aprovado');
    await request(app.getHttpServer())
      .post(`/v1/approvals/${approvalId}/decisions`)
      .set('Authorization', `Bearer ${tokenApprover}`)
      .send({ decision: 'APPROVE' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/v1/approvals/${approvalId}/decisions`)
      .set('Authorization', `Bearer ${tokenApprover}`)
      .send({ decision: 'APPROVE' })
      .expect(409);
  });

  it('REJECT por qualquer aprovador fecha pedido imediatamente', async () => {
    const subjectId = `00000000-0000-0000-0004-${String(RUN_ID).padStart(12, '0').slice(-12)}`;
    const approvalId = await createApproval(subjectId, 'rejeitar', 2); // requer 2 approves, mas 1 reject fecha
    const res = await request(app.getHttpServer())
      .post(`/v1/approvals/${approvalId}/decisions`)
      .set('Authorization', `Bearer ${tokenApprover}`)
      .send({ decision: 'REJECT', comment: 'fora do escopo' })
      .expect(200);
    expect(res.body.state).toBe('REJECTED');
  });

  it('pedido requerendo 2 aprovações só fecha com 2', async () => {
    const subjectId = `00000000-0000-0000-0005-${String(RUN_ID).padStart(12, '0').slice(-12)}`;
    const approvalId = await createApproval(subjectId, 'dupla', 2);

    const first = await request(app.getHttpServer())
      .post(`/v1/approvals/${approvalId}/decisions`)
      .set('Authorization', `Bearer ${tokenApprover}`)
      .send({ decision: 'APPROVE' })
      .expect(200);
    // Ainda PENDING: só 1 de 2 aprovações registradas.
    expect(first.body.state).toBe('PENDING');
    expect(first.body.approvalsReceived).toBe(1);

    // Sem um terceiro aprovador no seed, cobrimos o caminho até aqui.
    // Em uma iteração seguinte, adicionaremos múltiplos aprovadores.
  });

  it('solicitante pode cancelar seu próprio pedido PENDING', async () => {
    const subjectId = `00000000-0000-0000-0006-${String(RUN_ID).padStart(12, '0').slice(-12)}`;
    const approvalId = await createApproval(subjectId, 'cancelar');
    const res = await request(app.getHttpServer())
      .delete(`/v1/approvals/${approvalId}?reason=${encodeURIComponent('mudanca de escopo')}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    expect(res.body.state).toBe('CANCELLED');
  });

  it('outro usuário NÃO pode cancelar o pedido alheio', async () => {
    const subjectId = `00000000-0000-0000-0007-${String(RUN_ID).padStart(12, '0').slice(-12)}`;
    const approvalId = await createApproval(subjectId, 'cancelar alheio');
    await request(app.getHttpServer())
      .delete(`/v1/approvals/${approvalId}?reason=${encodeURIComponent('nao posso')}`)
      .set('Authorization', `Bearer ${tokenApprover}`)
      .expect(403);
  });
});
