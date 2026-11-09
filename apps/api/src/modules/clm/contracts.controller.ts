import { Controller, Get, NotFoundException, Param, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { PermissionsGuard, RequirePermissions } from '../../auth/permissions.decorator';
import { TenantContextService } from '../../tenant-context/tenant-context.service';
import { ContractsService } from './contracts.service';

@ApiTags('clm')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('contracts')
export class ContractsController {
  constructor(
    private readonly service: ContractsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private requireCtx(req: Request): { tenantId: string; userId: string } {
    const ctx = this.tenantContext.fromRequest(req as never);
    if (!ctx) throw new Error('contexto ausente após autenticação');
    return ctx;
  }

  @Get()
  @RequirePermissions('clm.contracts.read')
  @ApiOperation({ summary: 'Lista contratos do tenant' })
  async list(@Req() req: Request) {
    return this.service.list(this.requireCtx(req));
  }

  @Get(':id')
  @RequirePermissions('clm.contracts.read')
  @ApiOperation({ summary: 'Detalhe de um contrato' })
  async detail(@Req() req: Request, @Param('id') id: string) {
    const found = await this.service.detail(this.requireCtx(req), id);
    if (!found) throw new NotFoundException('contrato não encontrado');
    return found;
  }
}
