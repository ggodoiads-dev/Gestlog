import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { PermissionsGuard } from '../../auth/permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../tenant-context/tenant-context.service';

@ApiTags('core')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('me')
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Retorna o usuário e tenant da sessão atual' })
  async me(@Req() req: Request): Promise<{
    tenant: { id: string; slug: string; name: string };
    user: { id: string; email: string; fullName: string };
    roles: string[];
    permissions: string[];
  }> {
    const ctx = this.tenantContext.fromRequest(req as never);
    if (!ctx) {
      throw new Error('contexto ausente após autenticação');
    }
    const data = await this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: ctx.userId },
        include: { tenant: true },
      });
      return { user, tenant: user.tenant };
    });
    return {
      tenant: { id: data.tenant.id, slug: data.tenant.slug, name: data.tenant.name },
      user: { id: data.user.id, email: data.user.email, fullName: data.user.fullName },
      roles: ctx.roles,
      permissions: ctx.permissions ?? [],
    };
  }
}
