import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  mixin,
  type Type,
} from '@nestjs/common';

import { TenantContextService } from '../tenant-context/tenant-context.service';

/**
 * Requer que o usuário tenha TODAS as permissões listadas.
 *
 * Uso:
 *   @RequirePermissions('clients.read')
 *   async list() { ... }
 */
export function RequirePermissions(
  ...codes: string[]
): MethodDecorator & ClassDecorator {
  return SetMetadata('requiredPermissions', codes);
}

@Injectable()
export class PermissionsGuardImpl implements CanActivate {
  constructor(private readonly tenantContext: TenantContextService) {}

  canActivate(execCtx: ExecutionContext): boolean {
    const required = Reflect.getMetadata('requiredPermissions', execCtx.getHandler()) as
      | string[]
      | undefined;
    if (!required || required.length === 0) {
      return true;
    }
    // Lê primeiro do req (fonte estável); cai para AsyncLocalStorage só como
    // fallback. Isso evita falhas quando o pipeline do Nest quebra o ALS.
    const req = execCtx.switchToHttp().getRequest<Record<string, unknown>>();
    const ctx = this.tenantContext.fromRequest(req as never) ?? this.tenantContext.get();
    if (!ctx) {
      throw new ForbiddenException('TenantContext ausente');
    }
    const held = ctx.permissions ?? [];
    const missing = required.filter((p) => !held.includes(p));
    if (missing.length > 0) {
      throw new ForbiddenException(`permissão ausente: ${missing.join(', ')}`);
    }
    return true;
  }
}

export const PermissionsGuard: Type<CanActivate> = mixin(PermissionsGuardImpl);
