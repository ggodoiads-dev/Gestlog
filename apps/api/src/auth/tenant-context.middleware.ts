import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { TenantContextService } from '../tenant-context/tenant-context.service';
import { AuthService } from './auth.service';

/**
 * Middleware que roda ANTES dos guards. Extrai o Bearer token quando
 * presente, popula o `TenantContext` no `req` e no AsyncLocalStorage,
 * e invoca `next()` dentro desse escopo — garantindo que o contexto
 * persista por todo o pipeline (guards, interceptors, controllers,
 * services, afterInterceptors).
 *
 * Rotas públicas (@Public) continuam passando sem contexto; o guard é
 * quem rejeita 401 caso o endpoint seja protegido.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  private readonly log = new Logger(TenantContextMiddleware.name);

  constructor(
    private readonly auth: AuthService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return next();
    }
    const token = header.slice('Bearer '.length).trim();
    try {
      const payload = await this.auth.verifyToken(token);
      const ctx = {
        tenantId: payload.tenantId as never,
        userId: payload.sub as never,
        roles: payload.roles,
        permissions: payload.permissions,
        correlationId: payload.correlationId,
        requestId: (req.headers['x-request-id'] as string | undefined) ?? payload.correlationId,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      };
      (req as unknown as { tenantId: string }).tenantId = ctx.tenantId;
      (req as unknown as { correlationId: string }).correlationId = ctx.correlationId;
      this.tenantContext.setOnRequest(req as never, ctx as never);
      // Executa next() dentro do contexto — guards, controllers e services
      // chamados a partir daqui enxergam `tenantContext.require()`.
      this.tenantContext.run(ctx as never, () => next());
    } catch (err) {
      // Token inválido: deixa o guard responder 401 (não sabemos ainda se a
      // rota é pública). Nunca logar o token.
      this.log.debug(`token inválido: ${(err as Error).message}`);
      next();
    }
  }
}
