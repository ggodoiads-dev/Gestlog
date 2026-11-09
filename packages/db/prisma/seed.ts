/**
 * Seeds de DEMONSTRAÇÃO para o GESTLOG.
 *
 * Nada aqui representa dados reais da Primeira Classe Transportes. Todo
 * registro criado carrega a marca de demo (ver nomes contendo "DEMO" e a
 * flag FEATURE_DEMO_SEEDS). Os seeds são idempotentes: rodar de novo não
 * duplica dados.
 *
 * Dois tenants demo:
 *   - demo_pct       (Primeira Classe — DEMO)
 *   - demo_city_bus  (CityBus Transportes — DEMO)
 *
 * Cada tenant recebe:
 *   - 1 pessoa jurídica + 1 garagem;
 *   - roles de sistema (tenant_admin, operation_manager, viewer);
 *   - 1 usuário admin (@demo.gestlog.local) com senha fixa de DEMO;
 *   - 2 clientes corporativos.
 */
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

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
        pricingAmountCents: 18_000_00n, // R$ 18.000,00/mês (DEMO)
      },
      {
        legalName: 'Hospital Alpha Ltda — DEMO',
        cnpj: '00000000000353',
        tradeName: 'Hospital Alpha — DEMO',
        contractCode: 'CTR-ALP-001',
        pricingMode: 'PER_TRIP',
        pricingAmountCents: 420_00n, // R$ 420,00/viagem (DEMO)
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

const SYSTEM_ROLES: {
  code: string;
  name: string;
  description: string;
  permissions: string[];
}[] = [
  {
    code: 'tenant_admin',
    name: 'Administrador do tenant',
    description: 'Acesso total dentro do tenant. Nunca compartilhado entre tenants.',
    permissions: [
      'core.users.read',
      'core.users.manage',
      'core.roles.manage',
      'core.legal_entities.manage',
      'core.audit.read',
      'clients.read',
      'clients.manage',
      'clm.contracts.read',
      'clm.contracts.manage',
      'clm.contracts.approve',
      'routing.routes.read',
      'routing.routes.manage',
      'routing.routes.publish',
      'fleet.vehicles.read',
      'fleet.vehicles.manage',
      'workforce.drivers.read',
      'workforce.drivers.manage',
      'operations.trips.read',
      'operations.trips.dispatch',
      'operations.trips.validate',
      'operations.events.submit',
      'ar.receivables.read',
      'ar.receivables.issue',
      'ar.receivables.write',
      'governance.approvals.request',
      'governance.approvals.decide',
      'governance.approvals.read',
      'governance.delegations.manage',
    ],
  },
  {
    code: 'operation_manager',
    name: 'Gestor de Operações',
    description: 'Planejamento e execução operacional.',
    permissions: [
      'clients.read',
      'clm.contracts.read',
      'routing.routes.read',
      'routing.routes.manage',
      'routing.routes.publish',
      'fleet.vehicles.read',
      'workforce.drivers.read',
      'operations.trips.read',
      'operations.trips.dispatch',
      'operations.trips.validate',
    ],
  },
  {
    code: 'finance_approver',
    name: 'Aprovador financeiro',
    description: 'Decide pedidos de aprovação financeiros (não cria).',
    permissions: [
      'clm.contracts.read',
      'ar.receivables.read',
      'governance.approvals.read',
      'governance.approvals.decide',
    ],
  },
  {
    code: 'viewer',
    name: 'Leitor',
    description: 'Somente leitura dos dados operacionais principais.',
    permissions: [
      'clients.read',
      'clm.contracts.read',
      'routing.routes.read',
      'fleet.vehicles.read',
      'workforce.drivers.read',
      'operations.trips.read',
    ],
  },
];

async function seed(prisma: PrismaClient): Promise<void> {
  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  const allPermissions = await prisma.permission.findMany();
  const permByCode = new Map(allPermissions.map((p) => [p.code, p]));

  for (const tenantSeed of TENANTS) {
    await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.upsert({
        where: { slug: tenantSeed.slug },
        update: { name: tenantSeed.name },
        create: { slug: tenantSeed.slug, name: tenantSeed.name },
      });

      const legalEntity = await tx.legalEntity.upsert({
        where: { tenantId_cnpj: { tenantId: tenant.id, cnpj: tenantSeed.legalEntity.cnpj } },
        update: {
          legalName: tenantSeed.legalEntity.legalName,
          tradeName: tenantSeed.legalEntity.tradeName,
        },
        create: {
          tenantId: tenant.id,
          cnpj: tenantSeed.legalEntity.cnpj,
          legalName: tenantSeed.legalEntity.legalName,
          tradeName: tenantSeed.legalEntity.tradeName,
        },
      });

      await tx.garage.upsert({
        where: {
          // garages não têm unique composite por name; usamos findFirst + create pattern via upsert simulado
          id: (await tx.garage.findFirst({
            where: { tenantId: tenant.id, legalEntityId: legalEntity.id, name: tenantSeed.garage.name },
          }))?.id ?? '00000000-0000-0000-0000-000000000000',
        },
        update: { name: tenantSeed.garage.name },
        create: {
          tenantId: tenant.id,
          legalEntityId: legalEntity.id,
          name: tenantSeed.garage.name,
        },
      });

      // Roles de sistema por tenant.
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

        // Reset de permissões para garantir idempotência.
        await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
        for (const permCode of sysRole.permissions) {
          const perm = permByCode.get(permCode);
          if (!perm) throw new Error(`permissão ${permCode} não existe no catálogo`);
          await tx.rolePermission.create({
            data: { roleId: role.id, permissionId: perm.id },
          });
        }
      }

      // Admin do tenant.
      const admin = await tx.user.upsert({
        where: { tenantId_email: { tenantId: tenant.id, email: tenantSeed.adminEmail } },
        update: { passwordHash, status: 'ACTIVE' },
        create: {
          tenantId: tenant.id,
          email: tenantSeed.adminEmail,
          fullName: 'Admin DEMO',
          passwordHash,
          status: 'ACTIVE',
        },
      });

      const adminRoleId = roleByCode.get('tenant_admin')?.id;
      if (!adminRoleId) throw new Error('role tenant_admin ausente');
      await tx.userRole.deleteMany({ where: { userId: admin.id } });
      await tx.userRole.create({
        data: {
          tenantId: tenant.id,
          userId: admin.id,
          roleId: adminRoleId,
        },
      });

      // Aprovador financeiro (SoD: independente do admin que faz pedidos).
      const approverEmail = tenantSeed.adminEmail.replace('admin.', 'approver.');
      const approver = await tx.user.upsert({
        where: { tenantId_email: { tenantId: tenant.id, email: approverEmail } },
        update: { passwordHash, status: 'ACTIVE' },
        create: {
          tenantId: tenant.id,
          email: approverEmail,
          fullName: 'Aprovador DEMO',
          passwordHash,
          status: 'ACTIVE',
        },
      });
      const approverRoleId = roleByCode.get('finance_approver')?.id;
      if (!approverRoleId) throw new Error('role finance_approver ausente');
      await tx.userRole.deleteMany({ where: { userId: approver.id } });
      await tx.userRole.create({
        data: {
          tenantId: tenant.id,
          userId: approver.id,
          roleId: approverRoleId,
        },
      });

      // Viewer (perfil sem permissão de decidir).
      const viewerEmail = tenantSeed.adminEmail.replace('admin.', 'viewer.');
      const viewer = await tx.user.upsert({
        where: { tenantId_email: { tenantId: tenant.id, email: viewerEmail } },
        update: { passwordHash, status: 'ACTIVE' },
        create: {
          tenantId: tenant.id,
          email: viewerEmail,
          fullName: 'Viewer DEMO',
          passwordHash,
          status: 'ACTIVE',
        },
      });
      const viewerRoleId = roleByCode.get('viewer')?.id;
      if (!viewerRoleId) throw new Error('role viewer ausente');
      await tx.userRole.deleteMany({ where: { userId: viewer.id } });
      await tx.userRole.create({
        data: { tenantId: tenant.id, userId: viewer.id, roleId: viewerRoleId },
      });

      // Clientes corporativos + contrato DEMO vinculado à primeira pessoa jurídica.
      for (const clientSeed of tenantSeed.clients) {
        const client = await tx.client.upsert({
          where: { tenantId_cnpj: { tenantId: tenant.id, cnpj: clientSeed.cnpj } },
          update: {
            legalName: clientSeed.legalName,
            tradeName: clientSeed.tradeName,
            status: 'ACTIVE',
          },
          create: {
            tenantId: tenant.id,
            cnpj: clientSeed.cnpj,
            legalName: clientSeed.legalName,
            tradeName: clientSeed.tradeName,
            status: 'ACTIVE',
          },
        });

        await tx.contract.upsert({
          where: { tenantId_code: { tenantId: tenant.id, code: clientSeed.contractCode } },
          update: {
            title: `Fretamento corporativo — ${clientSeed.tradeName}`,
            status: 'ACTIVE',
            pricingMode: clientSeed.pricingMode,
            pricingAmountCents: clientSeed.pricingAmountCents,
          },
          create: {
            tenantId: tenant.id,
            clientId: client.id,
            legalEntityId: legalEntity.id,
            code: clientSeed.contractCode,
            title: `Fretamento corporativo — ${clientSeed.tradeName}`,
            status: 'ACTIVE',
            startDate: new Date('2026-01-01T00:00:00Z'),
            pricingMode: clientSeed.pricingMode,
            pricingAmountCents: clientSeed.pricingAmountCents,
          },
        });
      }
    });

    console.warn(`[seed] tenant ${tenantSeed.slug} pronto — admin: ${tenantSeed.adminEmail}`);
  }

  console.warn('[seed] OK. Senha demo: ' + DEMO_PASSWORD);
}

async function main(): Promise<void> {
  if (process.env.FEATURE_DEMO_SEEDS !== 'true') {
    console.warn('FEATURE_DEMO_SEEDS != "true" — pulando seeds de demo.');
    return;
  }
  const prisma = new PrismaClient();
  try {
    await seed(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
