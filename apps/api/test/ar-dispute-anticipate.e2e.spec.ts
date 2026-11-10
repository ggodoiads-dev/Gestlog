/**
 * AT-23 — Fatura contestada separa valor contestado e incontroverso.
 * AT-25 — Recebível já antecipado é oferecido novamente: bloqueia.
 *
 * Cenários:
 *   AT-23:
 *     - registrar contestação parcial → contestedCents != 0, uncontested ok
 *     - contestar > saldo → 409
 *     - resolver contestação (contestedCents=0) zera disputa
 *   AT-25:
 *     - antecipar → ok (gravado anticipatedAt)
 *     - antecipar de novo → 409 ALREADY_ANTICIPATED
 *     - antecipar recebível com contestação em aberto → 409 HAS_DISPUTE
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
let tenantId: string;
let contractId: string;
let clientId: string;

const RUN_ID = Date.now();
const COMPETENCE_YEAR = 2400 + (Math.floor(RUN_ID / 100) % 100);

async function login(): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email: EMAIL, password: PASSWORD })
    .expect(200);
  return res.body.accessToken as string;
}

async function makeReceivable(
  monthOffset: number,
  amountCents: bigint,
): Promise<string> {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL } },
  });
  const r = await prisma.receivable.create({
    data: {
      tenantId,
      contractId,
      clientId,
      competenceYear: COMPETENCE_YEAR,
      competenceMonth: monthOffset,
      amountCents,
      currency: 'BRL',
      status: 'OPEN',
      issuedAt: new Date(`${COMPETENCE_YEAR}-${String(monthOffset).padStart(2, '0')}-05`),
      dueDate: new Date(`${COMPETENCE_YEAR}-${String(monthOffset).padStart(2, '0')}-20`),
    },
  });
  await prisma.$disconnect();
  return r.id as string;
}

beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const moduleRef = await Test.createTestingModule({ imports: [AppModule as any] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready', 'health/integrations'] });
  await app.init();
  token = await login();

  const me = await request(app.getHttpServer())
    .get('/v1/me')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  tenantId = me.body.tenant.id as string;

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL } },
  });
  const contract = await prisma.contract.findFirst({ where: { code: 'CTR-ALP-001' } });
  contractId = contract.id;
  clientId = contract.clientId;
  await prisma.$disconnect();
});

afterAll(async () => {
  await app?.close();
});

describe('AT-23 — contestação separa valor', () => {
  it('registra contestação de 200 em um receivable de 1000', async () => {
    const id = await makeReceivable(1, 100_000n);
    const res = await request(app.getHttpServer())
      .post(`/v1/receivables/${id}/dispute`)
      .set('Authorization', `Bearer ${token}`)
      .send({ contestedCents: 20_000, reason: 'linha 3 cobra viagem já paga' })
      .expect(200);
    expect(res.body.contestedCents).toBe('20000');
    expect(res.body.uncontestedCents).toBe('80000');
  });

  it('contestar valor acima do saldo retorna 409', async () => {
    const id = await makeReceivable(2, 50_000n);
    await request(app.getHttpServer())
      .post(`/v1/receivables/${id}/dispute`)
      .set('Authorization', `Bearer ${token}`)
      .send({ contestedCents: 60_000, reason: 'valor maior que saldo' })
      .expect(409);
  });

  it('resolver contestação (contestedCents=0) zera a disputa', async () => {
    const id = await makeReceivable(3, 70_000n);
    await request(app.getHttpServer())
      .post(`/v1/receivables/${id}/dispute`)
      .set('Authorization', `Bearer ${token}`)
      .send({ contestedCents: 30_000, reason: 'contestação inicial' })
      .expect(200);

    const resolved = await request(app.getHttpServer())
      .post(`/v1/receivables/${id}/dispute`)
      .set('Authorization', `Bearer ${token}`)
      .send({ contestedCents: 0, reason: 'conciliação concluída' })
      .expect(200);
    expect(resolved.body.contestedCents).toBe('0');
  });
});

describe('AT-25 — antecipação única', () => {
  it('antecipar receivable limpo → OK', async () => {
    const id = await makeReceivable(4, 80_000n);
    const res = await request(app.getHttpServer())
      .post(`/v1/receivables/${id}/anticipate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reference: `ANT-${RUN_ID}-01` })
      .expect(200);
    expect(res.body.reference).toBe(`ANT-${RUN_ID}-01`);
    expect(typeof res.body.anticipatedAt).toBe('string');
  });

  it('antecipar de novo o mesmo receivable → 409 ALREADY_ANTICIPATED', async () => {
    const id = await makeReceivable(5, 60_000n);
    await request(app.getHttpServer())
      .post(`/v1/receivables/${id}/anticipate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reference: `ANT-${RUN_ID}-02a` })
      .expect(200);
    const res = await request(app.getHttpServer())
      .post(`/v1/receivables/${id}/anticipate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reference: `ANT-${RUN_ID}-02b` })
      .expect(409);
    expect(res.body.code).toBe('ALREADY_ANTICIPATED');
  });

  it('receivable com contestação em aberto NÃO pode ser antecipado', async () => {
    const id = await makeReceivable(6, 90_000n);
    await request(app.getHttpServer())
      .post(`/v1/receivables/${id}/dispute`)
      .set('Authorization', `Bearer ${token}`)
      .send({ contestedCents: 10_000, reason: 'contestação pendente' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .post(`/v1/receivables/${id}/anticipate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reference: `ANT-${RUN_ID}-03` })
      .expect(409);
    expect(res.body.code).toBe('HAS_DISPUTE');
  });
});
