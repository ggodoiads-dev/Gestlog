import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { PermissionsGuard, RequirePermissions } from '../../auth/permissions.decorator';
import { TenantContextService } from '../../tenant-context/tenant-context.service';
import { createVehicleSchema } from './fleet.dto';
import { VehiclesService } from './vehicles.service';

@ApiTags('fleet')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('vehicles')
export class VehiclesController {
  constructor(
    private readonly vehicles: VehiclesService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private requireCtx(req: Request): { tenantId: string; userId: string } {
    const ctx = this.tenantContext.fromRequest(req as never);
    if (!ctx) throw new Error('contexto ausente após autenticação');
    return ctx;
  }

  @Get()
  @RequirePermissions('fleet.vehicles.read')
  @ApiOperation({ summary: 'Lista veículos do tenant com elegibilidade' })
  async list(@Req() req: Request) {
    return this.vehicles.list(this.requireCtx(req));
  }

  @Post()
  @RequirePermissions('fleet.vehicles.manage')
  @ApiOperation({ summary: 'Cadastra um veículo' })
  async create(@Req() req: Request, @Body() body: unknown) {
    const parsed = createVehicleSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join('; '));
    }
    return this.vehicles.create(this.requireCtx(req), parsed.data);
  }
}
