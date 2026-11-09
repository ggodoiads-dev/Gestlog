import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { TenantContextService } from '../tenant-context/tenant-context.service';

/**
 * Guard global de autenticação. A extração do token e a propagação do
 * `TenantContext` acontecem no `TenantContextMiddleware` (ver
 * `tenant-context.middleware.ts`). Este guard apenas:
 *
 *   1. Honra `@Public()`.
 *   2. Verifica se há `TenantContext` populado no `req`; caso contrário, 401.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tenantContext: TenantContextService) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = Reflect.getMetadata('isPublic', context.getHandler()) === true;
    if (isPublic) {
      return true;
    }
    const req = context.switchToHttp().getRequest<Request>();
    const ctx = this.tenantContext.fromRequest(req as never);
    if (!ctx) {
      throw new UnauthorizedException('token ausente ou inválido');
    }
    return true;
  }
}
