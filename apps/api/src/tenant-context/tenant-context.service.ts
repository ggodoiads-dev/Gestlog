import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';

import type { TenantContext } from '@gestlog/shared';

/**
 * Propaga o `TenantContext` por requisição.
 *
 * Duas superfícies:
 *   - `set(req, ctx)` grava no objeto `req` (fonte de verdade estável durante
 *     o ciclo HTTP, mesmo quando o AsyncLocalStorage é perdido por quebras
 *     de async context em pipelines do NestJS).
 *   - `enter(ctx)` chama `AsyncLocalStorage.enterWith()` para permitir que
 *     serviços de domínio (ex.: PrismaService.withTenant) obtenham o contexto
 *     sem receber `req` como parâmetro.
 *
 * O método `require()` tenta primeiro o ALS e, se vazio, lê do `req` associado
 * via `setRequest()`. Essa redundância é intencional: garante que o contexto
 * sobreviva mesmo quando o pipeline do Nest cria novas tasks async.
 */
@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantContext>();

  run<T>(ctx: TenantContext, fn: () => T): T {
    return this.storage.run(ctx, fn);
  }

  enter(ctx: TenantContext): void {
    this.storage.enterWith(ctx);
  }

  setOnRequest(req: { gestlogTenantContext?: TenantContext }, ctx: TenantContext): void {
    req.gestlogTenantContext = ctx;
  }

  fromRequest(req: { gestlogTenantContext?: TenantContext }): TenantContext | undefined {
    return req.gestlogTenantContext;
  }

  get(): TenantContext | undefined {
    return this.storage.getStore();
  }

  require(): TenantContext {
    const ctx = this.storage.getStore();
    if (!ctx) {
      throw new Error('TenantContext ausente — rota chamada sem autenticação ou interceptor.');
    }
    return ctx;
  }
}
