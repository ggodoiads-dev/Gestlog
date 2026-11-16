// Seed de demonstração embarcado — versão mínima do packages/db/prisma/seed.ts
// Idempotente. Chamado pelo main.ts quando FEATURE_DEMO_SEEDS=true.
import * as argon2 from 'argon2';
import type { PrismaClient } from '@prisma/client';

const DEMO_PASSWORD = 'demo-password-only!';

interface TenantSeed {
  slug: string;
  name: string;
  legalEntity: { cnpj: string; legalName: string; tradeName: string };
  garage: { name: string };
  adminEmail: string;
  clients: {
    legalName: string;
    cnpj: string;
    tradeName: string;
    contractCode: string;
    pricingMode: 'MONTHLY_FIXED' | 'PER_TRIP';
    pricingAmountCents: bigint;
  }[];
}

const TENANTS: TenantSeed[] = [
  {
    slug: 'demo_pct',
    name: 'Primeira Classe Transportes — DEMO',
    legalEntity: {
      cnpj: '00000000000191',
      legalName: 'Primeira Classe Transportes LTDA — DEMO',
      tradeName: 'Primeira Classe — DEMO',
    },
    garage: { name: 'Garagem Central — DEMO' },
    adminEmail: 'admin.pct@demo.gestlog.local',
    clients: [
      {
        legalName: 'Fábrica Jandira S/A — DEMO',
        cnpj: '00000000000272',
        tradeName: 'Fábrica Jandira — DEMO',
        contractCode: 'CTR-JDA-001',
        pricingMode: 'MONTHLY_FIXED',
        pricingAmountCents: 18_000_00n,
      },
      {
        legalName: 'Hospital Alpha Ltda — DEMO',
        cnpj: '00000000000353',
        tradeName: 'Hospital Alpha — DEMO',
        contractCode: 'CTR-ALP-001',
        pricingMode: 'PER_TRIP',
        pricingAmountCents: 420_00n,
      },
    ],
  },
  {
    slug: 'demo_city_bus',
    name: 'CityBus Transportes — DEMO',
    legalEntity: {
      cnpj: '00000000000434',
      legalName: 'CityBus Transportes Urbanos LTDA — DEMO',
      tradeName: 'CityBus — DEMO',
    },
    garage: { name: 'Garagem Norte — DEMO' },
    adminEmail: 'admin.citybus@demo.gestlog.local',
    clients: [
      {
        legalName: 'Distrito Industrial LTDA — DEMO',
        cnpj: '00000000000515',
        tradeName: 'Distrito Industrial — DEMO',
        contractCode: 'CTR-DIN-001',
        pricingMode: 'MONTHLY_FIXED',
        pricingAmountCents: 25_000_00n,
      },
      {
        legalName: 'Call Center Beta S/A — DEMO',
        cnpj: '00000000000696',
        tradeName: 'Call Center Beta — DEMO',
        contractCode: 'CTR-CCB-001',
        pricingMode: 'PER_TRIP',
        pricingAmountCents: 350_00n,
      },
    ],
  },
];

const SYSTEM_ROLES = [
  {
    code: 'tenant_admin',
    name: 'Administrador do tenant',
    description: 'Acesso total dentro do tenant.',
    permissions: [
      'core.users.read', 'core.users.manage', 'core.roles.manage',
      'core.legal_entities.manage', 'core.audit.read',
      'clients.read', 'clients.manage',
      'clm.contracts.read', 'clm.contracts.manage', 'clm.contracts.approve',
      'routing.routes.read', 'routing.routes.manage', 'routing.routes.publish',
      'fleet.vehicles.read', 'fleet.vehicles.manage',
      'workforce.drivers.read', 'workforce.drivers.manage',
      'operations.trips.read', 'operations.trips.dispatch', 'operations.trips.validate',
      'operations.events.submit',
      'ar.receivables.read', 'ar.receivables.issue', 'ar.receivables.write',
      'governance.approvals.request', 'governance.approvals.decide', 'governance.approvals.read',
      'governance.delegations.manage',
      'procurement.orders.read', 'procurement.orders.manage', 'procurement.receive',
      'ap.payables.read', 'ap.payables.manage', 'ap.payments.execute',
      'finance.periods.read', 'finance.periods.close', 'finance.periods.reopen',
    ],
  },
  {
    code: 'viewer',
    name: 'Leitor',
    description: 'Somente leitura.',
    permissions: [
      'clients.read', 'clm.contracts.read', 'routing.routes.read',
      'fleet.vehicles.read', 'workforce.drivers.read', 'operations.trips.read',
    ],
  },
];

export async function runDemoSeed(prisma: PrismaClient): Promise<void> {
  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  const allPermissions = await (prisma as any).permission.findMany();
  const permByCode = new Map<string, { id: string }>(
    allPermissions.map((p: { code: string; id: string }) => [p.code, { id: p.id }]),
  );

  for (const t of TENANTS) {
    await prisma.$transaction(async (tx: any) => {
      const tenant = await tx.tenant.upsert({
        where: { slug: t.slug },
        update: { name: t.name },
        create: { slug: t.slug, name: t.name },
      });

      const legalEntity = await tx.legalEntity.upsert({
        where: { tenantId_cnpj: { tenantId: tenant.id, cnpj: t.legalEntity.cnpj } },
        update: {
          legalName: t.legalEntity.legalName,
          tradeName: t.legalEntity.tradeName,
        },
        create: {
          tenantId: tenant.id,
          cnpj: t.legalEntity.cnpj,
          legalName: t.legalEntity.legalName,
          tradeName: t.legalEntity.tradeName,
        },
      });

      const existingGarage = await tx.garage.findFirst({
        where: {
          tenantId: tenant.id,
          legalEntityId: legalEntity.id,
          name: t.garage.name,
        },
      });
      if (!existingGarage) {
        await tx.garage.create({
          data: {
            tenantId: tenant.id,
            legalEntityId: legalEntity.id,
            name: t.garage.name,
          },
        });
      }

      const roleByCode = new Map<string, { id: string }>();
      for (const sysRole of SYSTEM_ROLES) {
        const role = await tx.role.upsert({
          where: { tenantId_code: { tenantId: tenant.id, code: sysRole.code } },
          update: { name: sysRole.name, description: sysRole.description, isSystem: true },
          create: {
            tenantId: tenant.id,
            code: sysRole.code,
            name: sysRole.name,
            description: sysRole.description,
            isSystem: true,
          },
        });
        roleByCode.set(sysRole.code, { id: role.id });
        await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
        for (const permCode of sysRole.permissions) {
          const perm = permByCode.get(permCode);
          if (!perm) continue;
          await tx.rolePermission.create({
            data: { roleId: role.id, permissionId: perm.id },
          });
        }
      }

      const admin = await tx.user.upsert({
        where: { tenantId_email: { tenantId: tenant.id, email: t.adminEmail } },
        update: { passwordHash, status: 'ACTIVE' },
        create: {
          tenantId: tenant.id,
          email: t.adminEmail,
          fullName: 'Admin DEMO',
          passwordHash,
          status: 'ACTIVE',
        },
      });
      const adminRoleId = roleByCode.get('tenant_admin')?.id;
      if (adminRoleId) {
        await tx.userRole.deleteMany({ where: { userId: admin.id } });
        await tx.userRole.create({
          data: { tenantId: tenant.id, userId: admin.id, roleId: adminRoleId },
        });
      }

      for (const c of t.clients) {
        const client = await tx.client.upsert({
          where: { tenantId_cnpj: { tenantId: tenant.id, cnpj: c.cnpj } },
          update: {
            legalName: c.legalName,
            tradeName: c.tradeName,
            status: 'ACTIVE',
          },
          create: {
            tenantId: tenant.id,
            cnpj: c.cnpj,
            legalName: c.legalName,
            tradeName: c.tradeName,
            status: 'ACTIVE',
          },
        });
        await tx.contract.upsert({
          where: { tenantId_code: { tenantId: tenant.id, code: c.contractCode } },
          update: {
            title: `Fretamento corporativo — ${c.tradeName}`,
            status: 'ACTIVE',
            pricingMode: c.pricingMode,
            pricingAmountCents: c.pricingAmountCents,
          },
          create: {
            tenantId: tenant.id,
            clientId: client.id,
            legalEntityId: legalEntity.id,
            code: c.contractCode,
            title: `Fretamento corporativo — ${c.tradeName}`,
            status: 'ACTIVE',
            startDate: new Date('2026-01-01T00:00:00Z'),
            pricingMode: c.pricingMode,
            pricingAmountCents: c.pricingAmountCents,
          },
        });
      }
    });
    // eslint-disable-next-line no-console
    console.log(`seed: tenant ${t.slug} pronto — admin ${t.adminEmail}`);
  }
  // eslint-disable-next-line no-console
  console.log('seed: senha DEMO = ' + DEMO_PASSWORD);
}
