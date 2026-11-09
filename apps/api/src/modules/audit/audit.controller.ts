import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { PermissionsGuard, RequirePermissions } from '../../auth/permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../tenant-context/tenant-context.service';
import { AuditService } from './audit.service';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('audit/events')
export class AuditController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly service: AuditService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private requireCtx(req: Request): { tenantId: string; userId: string } {
    const ctx = this.tenantContext.fromRequest(req as never);
    if (!ctx) throw new Error('contexto ausente após autenticação');
    return ctx;
  }

  @Get()
  @RequirePermissions('core.audit.read')
  @ApiOperation({ summary: 'Listar eventos de auditoria do tenant' })
  async list(
    @Req() req: Request,
    @Query('subjectType') subjectType?: string,
    @Query('subjectId') subjectId?: string,
    @Query('action') action?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limitRaw?: string,
  ): Promise<{ items: unknown[] }> {
    const ctx = this.requireCtx(req);
    const limit = limitRaw ? Math.max(1, Math.min(500, Number.parseInt(limitRaw, 10) || 100)) : 100;

    const items = await this.prisma.withTenantFromCtx(ctx, (tx) =>
      this.service.list(
        tx,
        ctx.tenantId,
        {
          ...(subjectType ? { subjectType } : {}),
          ...(subjectId ? { subjectId } : {}),
          ...(action ? { action } : {}),
          ...(actorUserId ? { actorUserId } : {}),
          ...(from ? { from: new Date(from) } : {}),
          ...(to ? { to: new Date(to) } : {}),
        },
        limit,
      ),
    );

    return { items };
  }
}
