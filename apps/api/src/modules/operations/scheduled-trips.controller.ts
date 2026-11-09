import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';

import { PermissionsGuard, RequirePermissions } from '../../auth/permissions.decorator';
import { TenantContextService } from '../../tenant-context/tenant-context.service';
import { ScheduledTripsService } from './scheduled-trips.service';

const expandSchema = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

@ApiTags('operations')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller()
export class ScheduledTripsController {
  constructor(
    private readonly trips: ScheduledTripsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private requireCtx(req: Request): { tenantId: string; userId: string } {
    const ctx = this.tenantContext.fromRequest(req as never);
    if (!ctx) throw new Error('contexto ausente após autenticação');
    return ctx;
  }

  @Post('routes/:routeId/expand')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('routing.routes.publish')
  @ApiOperation({ summary: 'Expande viagens programadas para uma rota em uma janela de datas' })
  async expand(
    @Req() req: Request,
    @Param('routeId') routeId: string,
    @Body() body: unknown,
  ) {
    const parsed = expandSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join('; '));
    }
    return this.trips.expandForRoute(this.requireCtx(req), routeId, parsed.data);
  }

  @Get('scheduled-trips')
  @RequirePermissions('operations.trips.read')
  @ApiOperation({ summary: 'Lista viagens programadas em uma data' })
  async listByDate(@Req() req: Request, @Query('date') date: string) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('query `date=YYYY-MM-DD` obrigatório');
    }
    return this.trips.listByDate(this.requireCtx(req), date);
  }
}
