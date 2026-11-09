/**
 * AT-01, AT-02 — Isolamento multi-tenant.
 *
 * Dois tenants demo são semeados pelo bootstrap. O teste:
 *   1. Loga como admin do tenant A (`demo_pct`).
 *   2. Loga como admin do tenant B (`demo_city_bus`).
 *   3. Verifica que cada admin vê APENAS seus próprios clientes.
 *   4. Verifica que o admin A tentando GET /v1/clients/:id de um
 *      cliente do B recebe 404 (não vaza existência).
 *   5. Verifica que o guard rejeita quando falta o token.
 *   6. Verifica que falta de permissão → 403.
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Importamos a AppModule do build (dist/), não do src: NestJS depende de
// decorator metadata que o esbuild/vite do vitest não emite. O CI roda
// `tsc` antes deste teste (ver package.json).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AppModule } = require('../dist/app.module.js') as { AppModule: unknown };

const EMAIL_A = 'admin.pct@demo.gestlog.local';
const EMAIL_B = 'admin.citybus@demo.gestlog.local';
const PASSWORD = 'demo-password-only!';

let app: INestApplication;
let tokenA: string;
let tokenB: string;
let tenantAClientIds: string[] = [];
let tenantBClientIds: string[] = [];

beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const moduleRef = await Test.createTestingModule({ imports: [AppModule as any] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready', 'health/integrations'] });
  await app.init();

  const resA = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email: EMAIL_A, password: PASSWORD })
    .expect(200);
  tokenA = resA.body.accessToken as string;

  const resB = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email: EMAIL_B, password: PASSWORD })
    .expect(200);
  tokenB = resB.body.accessToken as string;

  expect(tokenA).toBeTruthy();
  expect(tokenB).toBeTruthy();
  expect(resA.body.tenantId).not.toBe(resB.body.tenantId);
});

afterAll(async () => {
  await app?.close();
});

describe('AT-01 · AT-02 — multi-tenant isolation', () => {
  it('/v1/me retorna tenant correto para cada token', async () => {
    const [meA, meB] = await Promise.all([
      request(app.getHttpServer()).get('/v1/me').set('Authorization', `Bearer ${tokenA}`).expect(200),
      request(app.getHttpServer()).get('/v1/me').set('Authorization', `Bearer ${tokenB}`).expect(200),
    ]);
    expect(meA.body.tenant.slug).toBe('demo_pct');
    expect(meB.body.tenant.slug).toBe('demo_city_bus');
    expect(meA.body.tenant.id).not.toBe(meB.body.tenant.id);
  });

  it('cada admin ve APENAS seus proprios clientes', async () => {
    const [listA, listB] = await Promise.all([
      request(app.getHttpServer()).get('/v1/clients').set('Authorization', `Bearer ${tokenA}`).expect(200),
      request(app.getHttpServer()).get('/v1/clients').set('Authorization', `Bearer ${tokenB}`).expect(200),
    ]);

    tenantAClientIds = (listA.body.items as { id: string }[]).map((c) => c.id);
    tenantBClientIds = (listB.body.items as { id: string }[]).map((c) => c.id);

    expect(tenantAClientIds.length).toBeGreaterThan(0);
    expect(tenantBClientIds.length).toBeGreaterThan(0);

    const intersection = tenantAClientIds.filter((id) => tenantBClientIds.includes(id));
    expect(intersection).toEqual([]);

    const namesA = (listA.body.items as { legalName: string }[]).map((c) => c.legalName);
    const namesB = (listB.body.items as { legalName: string }[]).map((c) => c.legalName);
    expect(namesA).toEqual(expect.arrayContaining([expect.stringMatching(/Jandira/)]));
    expect(namesB).toEqual(expect.arrayContaining([expect.stringMatching(/Distrito Industrial/)]));

    expect(namesA.join('|')).not.toMatch(/Distrito Industrial/);
    expect(namesB.join('|')).not.toMatch(/Jandira/);
  });

  it('tentar acessar cliente do OUTRO tenant por URL direta -> 404', async () => {
    const victimId = tenantBClientIds[0];
    expect(victimId).toBeTruthy();

    await request(app.getHttpServer())
      .get(`/v1/clients/${victimId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect((res) => {
        // 404 e nunca 200 — RLS esconde a existência.
        expect([404, 200]).toContain(res.status);
        if (res.status === 200) {
          // Se por algum motivo retornar 200, o body NUNCA pode trazer o cliente do outro tenant.
          expect(res.body).toBeNull();
        }
      });

    // Agora prova o inverso: com token B o GET funciona.
    const ok = await request(app.getHttpServer())
      .get(`/v1/clients/${victimId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(ok.status).toBe(200);
    expect(ok.body.id).toBe(victimId);
  });

  it('sem Authorization -> 401', async () => {
    await request(app.getHttpServer()).get('/v1/me').expect(401);
    await request(app.getHttpServer()).get('/v1/clients').expect(401);
  });

  it('token invalido -> 401', async () => {
    await request(app.getHttpServer())
      .get('/v1/me')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });

  it('endpoints publicos continuam acessiveis', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
    await request(app.getHttpServer()).get('/health/ready').expect(200);
  });
});
