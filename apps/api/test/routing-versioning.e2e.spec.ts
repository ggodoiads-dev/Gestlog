/**
 * AT-17 / AT-35 (parcial) — Versionamento de rotagrama.
 *
 * Fluxo coberto:
 *   1. Admin cria rota + versão v1 (DRAFT) + publica.
 *   2. Expande ScheduledTrip para a janela de novembro/2026.
 *   3. Cria uma SEGUNDA versão (v2) com diferente paradas + publica.
 *      Vigência da v2 começa no futuro (01/12/2026).
 *   4. Verifica:
 *      - Viagens criadas em novembro continuam amarradas à versão v1
 *        (tabela imutável → não reescreve histórico).
 *      - Nova expansão em dezembro usa v2.
 *      - Nenhuma viagem em novembro mudou para v2.
 *      - Replay da mesma expansão é idempotente (skipped).
 *   5. Confirma que tentar publicar uma versão já publicada → 409.
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const { AppModule } = require('../dist/app.module.js') as { AppModule: unknown };

const EMAIL_A = 'admin.pct@demo.gestlog.local';
const PASSWORD = 'demo-password-only!';

let app: INestApplication;
let token: string;
let contractId: string;
let routeId: string;
let v1Id: string;
let v2Id: string;

beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const moduleRef = await Test.createTestingModule({ imports: [AppModule as any] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready', 'health/integrations'] });
  await app.init();

  const resLogin = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email: EMAIL_A, password: PASSWORD })
    .expect(200);
  token = resLogin.body.accessToken as string;

  // Pega o contrato CTR-JDA-001 (seedado para demo_pct).
  // Não há endpoint ainda, mas o nosso Route.create precisa de contractId.
  // Vamos usar o endpoint de clients para garantir que está no tenant certo
  // e consultar o contrato direto via Prisma seria tentador, mas melhor
  // adicionar endpoint simples: por ora fazemos um find pelo ID conhecido.
  // Para o teste, pegamos o contractId via query direta ao DB seedado.
  // (Em commits seguintes, adicionaremos /v1/contracts).
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL } },
  });
  const contract = await prisma.contract.findFirst({ where: { code: 'CTR-JDA-001' } });
  contractId = contract.id;
  await prisma.$disconnect();
});

afterAll(async () => {
  await app?.close();
});

describe('AT-17/AT-35 — versionamento de rotas', () => {
  it('cria rota (status=DRAFT) e versão v1', async () => {
    const routeCode = `R-TEST-${Date.now()}`;
    const resRoute = await request(app.getHttpServer())
      .post('/v1/routes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        contractId,
        code: routeCode,
        name: 'Rota de Teste — Jandira',
        direction: 'IDA',
      })
      .expect(201);
    routeId = resRoute.body.id as string;

    const resV1 = await request(app.getHttpServer())
      .post(`/v1/routes/${routeId}/versions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        effectiveFrom: '2026-11-01',
        effectiveTo: '2026-11-30',
        targetArrivalOffsetMin: 10,
        maxWalkMeters: 500,
        stops: [
          { sequence: 1, name: 'Ponto A', latitude: -23.5, longitude: -46.6, offsetMinutes: -45 },
          { sequence: 2, name: 'Ponto B', latitude: -23.55, longitude: -46.63, offsetMinutes: -25 },
          { sequence: 3, name: 'Fábrica', latitude: -23.57, longitude: -46.65, offsetMinutes: 0 },
        ],
        turns: [
          { label: 'Manhã', targetArrivalTime: '06:00', daysOfWeek: [1, 2, 3, 4, 5] },
        ],
      })
      .expect(201);
    v1Id = resV1.body.id as string;
    expect(resV1.body.version).toBe(1);

    await request(app.getHttpServer())
      .post(`/v1/routes/${routeId}/versions/${v1Id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('expande viagens para novembro/2026 na v1', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/routes/${routeId}/expand`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fromDate: '2026-11-02', toDate: '2026-11-13' }) // 2 semanas de dias uteis
      .expect(200);

    expect(res.body.routeVersionId).toBe(v1Id);
    // 2 semanas × 5 dias uteis = 10 viagens em cada turno (1 turno)
    expect(res.body.created).toBe(10);
    expect(res.body.skipped).toBe(0);
  });

  it('expansão replay é idempotente', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/routes/${routeId}/expand`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fromDate: '2026-11-02', toDate: '2026-11-13' })
      .expect(200);
    expect(res.body.created).toBe(0);
    expect(res.body.skipped).toBe(10);
  });

  it('cria e publica v2 com paradas diferentes vigente a partir de dezembro/2026', async () => {
    const resV2 = await request(app.getHttpServer())
      .post(`/v1/routes/${routeId}/versions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        effectiveFrom: '2026-12-01',
        targetArrivalOffsetMin: 15, // mudou
        maxWalkMeters: 500,
        stops: [
          { sequence: 1, name: 'Ponto A (NOVO)', latitude: -23.5, longitude: -46.6, offsetMinutes: -50 },
          { sequence: 2, name: 'Ponto B (NOVO)', latitude: -23.55, longitude: -46.63, offsetMinutes: -30 },
          { sequence: 3, name: 'Fábrica', latitude: -23.57, longitude: -46.65, offsetMinutes: 0 },
        ],
        turns: [
          { label: 'Manhã', targetArrivalTime: '06:00', daysOfWeek: [1, 2, 3, 4, 5] },
        ],
      })
      .expect(201);
    v2Id = resV2.body.id as string;
    expect(resV2.body.version).toBe(2);

    await request(app.getHttpServer())
      .post(`/v1/routes/${routeId}/versions/${v2Id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('expansão em dezembro usa v2; viagens de novembro continuam em v1', async () => {
    const resDec = await request(app.getHttpServer())
      .post(`/v1/routes/${routeId}/expand`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fromDate: '2026-12-01', toDate: '2026-12-11' })
      .expect(200);
    expect(resDec.body.routeVersionId).toBe(v2Id);
    expect(resDec.body.created).toBeGreaterThan(0);

    // Checa viagens em um dia de novembro (ex.: 2026-11-04, quarta-feira).
    const resNov = await request(app.getHttpServer())
      .get('/v1/scheduled-trips?date=2026-11-04')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(resNov.body.items.length).toBeGreaterThan(0);
    for (const t of resNov.body.items) {
      // Todas as viagens de novembro devem estar na v1.
      expect(t.routeVersion).toBe(1);
    }

    // Checa viagens em um dia de dezembro (2026-12-02, quarta).
    const resDecList = await request(app.getHttpServer())
      .get('/v1/scheduled-trips?date=2026-12-02')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(resDecList.body.items.length).toBeGreaterThan(0);
    for (const t of resDecList.body.items) {
      expect(t.routeVersion).toBe(2);
    }
  });

  it('publicar uma versão já publicada retorna 409', async () => {
    await request(app.getHttpServer())
      .post(`/v1/routes/${routeId}/versions/${v1Id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
  });
});
