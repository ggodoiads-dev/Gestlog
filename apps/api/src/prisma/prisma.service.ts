import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService que respeita o contrato ADR-0003.
 *
 * Duas conexões:
 *   - `appClient`: conecta via role `gestlog_app` (NOBYPASSRLS).
 *     Toda operação de domínio passa por `withTenantFromCtx` para abrir
 *     uma transação com `SET LOCAL app.current_tenant`.
 *   - `adminClient`: conecta via role `gestlog_admin` (BYPASSRLS).
 *     Uso EXCLUSIVO em operações globais explicitamente auditadas:
 *     login (resolver usuário pelo e-mail antes de saber o tenant) e
 *     bootstrap/seeds. Nunca para dados tenant-scoped em requisições
 *     normais.
 *
 * Em dev, `DATABASE_APP_URL` e `DATABASE_ADMIN_URL` caem para
 * `DATABASE_URL` se ausentes. Em produção são obrigatórios e separados.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PrismaService.name);
  readonly appClient: PrismaClient;
  readonly adminClient: PrismaClient;

  constructor() {
    const fallback = process.env.DATABASE_URL ?? '';
    const appUrl = process.env.DATABASE_APP_URL ?? fallback;
    const adminUrl = process.env.DATABASE_ADMIN_URL ?? fallback;
    this.appClient = new PrismaClient({ datasources: { db: { url: appUrl } } });
    this.adminClient = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  }

  async onModuleInit(): Promise<void> {
    await Promise.all([this.appClient.$connect(), this.adminClient.$connect()]);
    this.log.log('Prisma conectado (app + admin)');
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.appClient.$disconnect(), this.adminClient.$disconnect()]);
  }

  /**
   * Abre uma transação com `SET LOCAL app.current_tenant` definido.
   * Toda operação tenant-scoped deve passar por aqui.
   */
  async withTenantFromCtx<T>(
    ctx: { tenantId: string },
    fn: (tx: PrismaClient) => Promise<T>,
  ): Promise<T> {
    return this.appClient.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${ctx.tenantId}'`);
      return fn(tx as unknown as PrismaClient);
    });
  }
}
