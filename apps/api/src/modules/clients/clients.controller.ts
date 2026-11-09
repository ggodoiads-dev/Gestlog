import { Controller, Get, NotFoundException, Param, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { PermissionsGuard, RequirePermissions } from '../../auth/permissions.decorator';
import { TenantContextService } from '../../tenant-context/tenant-context.service';
import { ClientsService } from './clients.service';

@ApiTags('clients')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('clients')
export class ClientsController {
  constructor(
    private readonly clients: ClientsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get()
  @RequirePermissions('clients.read')
  @ApiOperation({ summary: 'Lista clientes do tenant atual' })
  async list(@Req() req: Request): Promise<{
    items: {
      id: string;
      legalName: string;
      tradeName: string | null;
      cnpj: string | null;
      status: string;
    }[];
  }> {
    const ctx = this.tenantContext.fromRequest(req as never);
    if (!ctx) throw new Error('contexto ausente após autenticação');
    return this.clients.list(ctx);
  }

  @Get(':id')
  @RequirePermissions('clients.read')
  @ApiOperation({ summary: 'Detalhe de um cliente — RLS isola por tenant' })
  async detail(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<{
    id: string;
    legalName: string;
    tradeName: string | null;
    cnpj: string | null;
  }> {
    const ctx = this.tenantContext.fromRequest(req as never);
    if (!ctx) throw new Error('contexto ausente após autenticação');
    const found = await this.clients.findById(ctx, id);
    if (!found) {
      // 404 — nunca 403: não vazamos existência cruzando tenants.
      throw new NotFoundException('cliente não encontrado');
    }
    return found;
  }
}
