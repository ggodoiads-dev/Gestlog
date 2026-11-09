import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { PermissionsGuard, RequirePermissions } from '../../auth/permissions.decorator';
import { TenantContextService } from '../../tenant-context/tenant-context.service';
import { DriversService } from './drivers.service';
import { createDriverSchema } from './workforce.dto';

@ApiTags('workforce')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('drivers')
export class DriversController {
  constructor(
    private readonly drivers: DriversService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private requireCtx(req: Request): { tenantId: string; userId: string } {
    const ctx = this.tenantContext.fromRequest(req as never);
    if (!ctx) throw new Error('contexto ausente após autenticação');
    return ctx;
  }

  @Get()
  @RequirePermissions('workforce.drivers.read')
  @ApiOperation({ summary: 'Lista motoristas com a habilitação vigente' })
  async list(@Req() req: Request) {
    return this.drivers.list(this.requireCtx(req));
  }

  @Post()
  @RequirePermissions('workforce.drivers.manage')
  @ApiOperation({ summary: 'Cadastra motorista + habilitação inicial' })
  async create(@Req() req: Request, @Body() body: unknown) {
    const parsed = createDriverSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join('; '));
    }
    return this.drivers.create(this.requireCtx(req), parsed.data);
  }
}
