import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';

import type { TenantContext } from '@gestlog/shared';

/**
 * Armazena o `TenantContext` por requisição usando AsyncLocalStorage.
 *
 * O interceptor de request popula o contexto após a autenticação; qualquer
 * acesso ao banco em domínio passa por `withTenantScope` lendo deste serviço.
 * Fora de uma requisição autenticada, `get()` retorna `undefined` e os
 * repositórios tenant-scoped falham cedo e ruidosamente.
 */
@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantContext>();

  run<T>(ctx: TenantContext, fn: () => T): T {
    return this.storage.run(ctx, fn);
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
