/**
 * Assets — Fase E: AT-29, AT-30, AT-31, AT-32.
 *
 * AT-29 — EBITDA só soma OPEX. CAPEX, FINANCIAL_INTEREST,
 *         FINANCIAL_PRINCIPAL e TAX_INCOME ficam fora da margem
 *         operacional.
 * AT-30 — Baixar ativo com financiamento ativo exige
 *         creditorConsentAt + creditorConsentDoc.
 * AT-31 — Revisão de vida útil altera só depreciação futura; entradas
 *         anteriores a effectiveFrom permanecem intactas.
 * AT-32 — CAPEX capitalizado NÃO entra em opex (coberto junto do AT-29 aqui).
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
let legalEntityId: string;
let tenantId: string;

const RUN_ID = Date.now();
const YEAR = 2250 + (Math.floor(RUN_ID / 10000) % 50);
const MONTH = (Math.abs(RUN_ID) % 12) + 1;

async function login(email: string, password: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return res.body.accessToken as string;
}

function iso(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m - 1, d)).toISOString();
}

beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const moduleRef = await Test.createTestingModule({ imports: [AppModule as any] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready', 'health/integrations'] });
  await app.init();
  token = await login(EMAIL, PASSWORD);

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
  legalEntityId = contract.legalEntityId;
  await prisma.$disconnect();
});

afterAll(async () => {
  await app?.close();
});

describe('AT-29 + AT-32 — EBITDA ignora CAPEX, juros, principal e IR', () => {
  it('cria payables em todas as classifications da competência', async () => {
    // Vamos criar diretamente no banco (não há endpoint público de create payable
    // sem order; o seed e AT-16 já criam via Procurement).
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL } },
    });
    const issued = new Date(iso(YEAR, MONTH, 10));
    const common = {
      tenantId,
      supplierName: 'Fornecedor AT-29',
      description: 'teste',
      currency: 'BRL',
      issuedAt: issued,
      dueDate: issued,
      status: 'OPEN',
    };
    await prisma.payableInvoice.createMany({
      data: [
        { ...common, amountCents: 10_000n, classification: 'OPEX_FUEL' },
        { ...common, amountCents: 20_000n, classification: 'OPEX_MAINTENANCE' },
        { ...common, amountCents: 50_000n, classification: 'CAPEX' },
        { ...common, amountCents: 30_000n, classification: 'FINANCIAL_INTEREST' },
        { ...common, amountCents: 40_000n, classification: 'FINANCIAL_PRINCIPAL' },
        { ...common, amountCents: 15_000n, classification: 'TAX_INCOME' },
      ],
    });
    await prisma.$disconnect();
  });

  it('DRE da competência mostra opex = 10k + 20k = 30k (ignora CAPEX, juros, principal, IR)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/finance/dre?legalEntityId=${legalEntityId}&year=${YEAR}&month=${MONTH}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.opexCents).toBe('30000');
  });
});

describe('AT-31 — revisão de vida útil não é retroativa', () => {
  let assetId: string;

  it('cria ativo com 60 meses de vida útil e R$ 60.000 de custo', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/assets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        legalEntityId,
        code: `ATV-${RUN_ID}`,
        name: 'Ônibus urbano piloto AT-31',
        category: 'VEHICLE',
        acquisitionCostCents: 6_000_000, // R$ 60.000
        acquisitionDate: iso(YEAR, 1, 1),
        residualCents: 0,
        usefulLifeMonths: 60, // R$ 1.000 por mês
      })
      .expect(201);
    assetId = res.body.id;
  });

  it('computa depreciação de março (mês 3) = R$ 1.000', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/assets/depreciation/${YEAR}/3`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(res.body.computed).toBeGreaterThanOrEqual(1);

    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL } },
    });
    const entry = await prisma.depreciationEntry.findUnique({
      where: {
        tenantId_assetId_year_month: { tenantId, assetId, year: YEAR, month: 3 },
      },
    });
    expect(entry.amountCents.toString()).toBe('100000'); // R$ 1.000
    expect(entry.usefulLifeMonthsAtCalc).toBe(60);
    await prisma.$disconnect();
  });

  it('registra revisão: a partir de maio, vida útil cai para 24 meses', async () => {
    await request(app.getHttpServer())
      .post(`/v1/assets/${assetId}/life-reviews`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        newUsefulLifeMonths: 24,
        effectiveFrom: iso(YEAR, 5, 1),
        reason: 'uso mais intenso que o previsto; revisão para 24 meses',
      })
      .expect(201);
  });

  it('depreciação de abril continua pela vida antiga (R$ 1.000)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/assets/depreciation/${YEAR}/4`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(res.body.computed).toBeGreaterThanOrEqual(1);

    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL } },
    });
    const entry = await prisma.depreciationEntry.findUnique({
      where: {
        tenantId_assetId_year_month: { tenantId, assetId, year: YEAR, month: 4 },
      },
    });
    expect(entry.amountCents.toString()).toBe('100000');
    expect(entry.usefulLifeMonthsAtCalc).toBe(60);
    await prisma.$disconnect();
  });

  it('depreciação de maio usa vida nova (R$ 2.500)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/assets/depreciation/${YEAR}/5`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(res.body.computed).toBeGreaterThanOrEqual(1);

    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL } },
    });
    const entry = await prisma.depreciationEntry.findUnique({
      where: {
        tenantId_assetId_year_month: { tenantId, assetId, year: YEAR, month: 5 },
      },
    });
    expect(entry.amountCents.toString()).toBe('250000'); // R$ 2.500
    expect(entry.usefulLifeMonthsAtCalc).toBe(24);
    await prisma.$disconnect();
  });

  it('recomputar março (já existente) é idempotente — skipped ≥ 1', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/assets/depreciation/${YEAR}/3`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(res.body.skipped).toBeGreaterThanOrEqual(1);
  });
});

describe('AT-30 — baixa com financiamento exige consentimento do credor', () => {
  let assetId: string;

  it('cria ativo e adiciona financiamento ativo', async () => {
    const resA = await request(app.getHttpServer())
      .post('/v1/assets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        legalEntityId,
        code: `ATV-FIN-${RUN_ID}`,
        name: 'Van financiada AT-30',
        category: 'VEHICLE',
        acquisitionCostCents: 20_000_000, // R$ 200.000
        acquisitionDate: iso(YEAR, 1, 15),
        usefulLifeMonths: 60,
      })
      .expect(201);
    assetId = resA.body.id;

    await request(app.getHttpServer())
      .post(`/v1/assets/${assetId}/financings`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        creditorName: 'Banco X',
        originalPrincipalCents: 15_000_000,
        interestRateBps: 1200,
        termMonths: 48,
        startDate: iso(YEAR, 1, 15),
      })
      .expect(201);
  });

  it('dispose SEM creditorConsent é 403 com código estruturado', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/assets/${assetId}/dispose`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'SALE',
        disposedAt: iso(YEAR, 6, 1),
        proceedsCents: 18_000_000,
      })
      .expect(403);
    expect(res.body.message?.code ?? res.body.code).toBe('CREDITOR_CONSENT_REQUIRED');
  });

  it('dispose COM creditorConsent passa e muda status para DISPOSED', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/assets/${assetId}/dispose`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'SALE',
        disposedAt: iso(YEAR, 6, 1),
        proceedsCents: 18_000_000,
        creditorConsentAt: iso(YEAR, 5, 28),
        creditorConsentDoc: 'carta de anuência nº 2026-0123',
      })
      .expect(201);
    expect(res.body.status).toBe('DISPOSED');
  });

  it('ativo sem financiamento ativo pode ser baixado direto (SCRAP)', async () => {
    const resA = await request(app.getHttpServer())
      .post('/v1/assets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        legalEntityId,
        code: `ATV-FREE-${RUN_ID}`,
        name: 'Impressora velha AT-30',
        category: 'IT_HARDWARE',
        acquisitionCostCents: 50_000,
        acquisitionDate: iso(YEAR, 1, 20),
        usefulLifeMonths: 36,
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/v1/assets/${resA.body.id}/dispose`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'SCRAP',
        disposedAt: iso(YEAR, 6, 2),
      })
      .expect(201);
    expect(res.body.status).toBe('WRITE_OFF');
  });
});
