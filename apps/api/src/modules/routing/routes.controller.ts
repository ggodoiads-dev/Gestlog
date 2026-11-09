import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { PermissionsGuard, RequirePermissions } from '../../auth/permissions.decorator';
import { TenantContextService } from '../../tenant-context/tenant-context.service';
import { createRouteSchema } from './routing.dto';
import { RoutesService } from './routes.service';

@ApiTags('routing')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('routes')
export class RoutesController {
  constructor(
    private readonly routes: RoutesService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private requireCtx(req: Request): { tenantId: string; userId: string } {
    const ctx = this.tenantContext.fromRequest(req as never);
    if (!ctx) throw new Error('contexto ausente após autenticação');
    return ctx;
  }

  @Get()
  @RequirePermissions('routing.routes.read')
  @ApiOperation({ summary: 'Lista rotas do tenant' })
  async list(@Req() req: Request) {
    return this.routes.listRoutes(this.requireCtx(req));
  }

  @Post()
  @RequirePermissions('routing.routes.manage')
  @ApiOperation({ summary: 'Cria uma rota (status=DRAFT)' })
  async create(@Req() req: Request, @Body() body: unknown) {
    const parsed = createRouteSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join('; '));
    }
    return this.routes.createRoute(this.requireCtx(req), parsed.data);
  }

  @Get(':id')
  @RequirePermissions('routing.routes.read')
  @ApiOperation({ summary: 'Detalhe da rota + histórico de versões' })
  async detail(@Req() req: Request, @Param('id') id: string) {
    const found = await this.routes.getRoute(this.requireCtx(req), id);
    if (!found) throw new NotFoundException('rota não encontrada');
    return found;
  }
}
