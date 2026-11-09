import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { PermissionsGuard, RequirePermissions } from '../../auth/permissions.decorator';
import { TenantContextService } from '../../tenant-context/tenant-context.service';
import { createRouteVersionSchema } from './routing.dto';
import { RoutesService } from './routes.service';

@ApiTags('routing')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('routes/:routeId/versions')
export class RouteVersionsController {
  constructor(
    private readonly routes: RoutesService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private requireCtx(req: Request): { tenantId: string; userId: string } {
    const ctx = this.tenantContext.fromRequest(req as never);
    if (!ctx) throw new Error('contexto ausente após autenticação');
    return ctx;
  }

  @Post()
  @RequirePermissions('routing.routes.manage')
  @ApiOperation({ summary: 'Cria uma nova versão (rascunho) de rota' })
  async createVersion(
    @Req() req: Request,
    @Param('routeId') routeId: string,
    @Body() body: unknown,
  ) {
    const parsed = createRouteVersionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    return this.routes.createDraftVersion(this.requireCtx(req), routeId, parsed.data);
  }

  @Post(':versionId/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('routing.routes.publish')
  @ApiOperation({ summary: 'Publica a versão rascunho (torna imutável)' })
  async publish(@Req() req: Request, @Param('versionId') versionId: string) {
    return this.routes.publishVersion(this.requireCtx(req), versionId);
  }
}
