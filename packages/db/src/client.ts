import { PrismaClient } from '@prisma/client';

/**
 * Único ponto de criação do PrismaClient na aplicação.
 *
 * - Em produção, usar a role `gestlog_app` (sem BYPASSRLS).
 * - A role administrativa só é usada por workers de plataforma,
 *   e seu acesso é auditado.
 */
export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: connectionString } },
    log:
      process.env.NODE_ENV === 'production'
        ? ['error', 'warn']
        : ['warn', 'error'],
  });
}

export type { PrismaClient } from '@prisma/client';
