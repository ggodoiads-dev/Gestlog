import type { PrismaClient } from '@prisma/client';

export interface TenantScope {
  tenantId: string;
}

/**
 * Executa `fn` em uma transação com `app.current_tenant` definido.
 * TODA query tenant-scoped PRECISA passar por aqui — caso contrário,
 * a policy RLS rejeita e os logs capturam o uso indevido.
 */
export async function withTenantScope<T>(
  prisma: PrismaClient,
  scope: TenantScope,
  fn: (tx: PrismaClient) => Promise<T>,
): Promise<T> {
  if (!scope.tenantId) {
    throw new Error('withTenantScope: tenantId é obrigatório');
  }
  return prisma.$transaction(async (tx) => {
    // $executeRawUnsafe aqui é seguro: o valor passou por UUID na borda da
    // aplicação (Zod); nunca vem direto do usuário.
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${scope.tenantId}'`);
    return fn(tx as unknown as PrismaClient);
  });
}

/**
 * Execução administrativa (sem tenant). Use apenas em jobs da plataforma
 * (migration, seeds de catálogos globais, suporte). Todo uso deve ser
 * auditado.
 */
export async function withPlatformScope<T>(
  prisma: PrismaClient,
  reason: string,
  fn: (tx: PrismaClient) => Promise<T>,
): Promise<T> {
  if (!reason) {
    throw new Error('withPlatformScope exige `reason` para auditoria');
  }
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = ''`);
    return fn(tx as unknown as PrismaClient);
  });
}
