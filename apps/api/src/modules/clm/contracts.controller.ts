import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';

import { PermissionsGuard, RequirePermissions } from '../../auth/permissions.decorator';
import { TenantContextService } from '../../tenant-context/tenant-context.service';
import { ContractsService } from './contracts.service';

const adjustSchema = z.object({
  effectiveFrom: z.string().min(10).max(10),
  newPricingMode: z.enum(['MONTHLY_FIXED', 'PER_TRIP']),
  newPricingAmountCents: z.number().int().positive(),
  reason: z.string().min(5).max(500),
  currency: z.string().length(3).optional(),
});

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

  @Get(':id/adjustments')
  @RequirePermissions('clm.contracts.read')
  @ApiOperation({ summary: 'Lista reajustes de preço do contrato (AT-21)' })
  async listAdjustments(@Req() req: Request, @Param('id') id: string) {
    return this.service.listAdjustments(this.requireCtx(req), id);
  }

  @Post(':id/adjustments')
  @RequirePermissions('clm.contracts.adjust')
  @ApiOperation({ summary: 'Registra reajuste de preço vigente a partir de effectiveFrom' })
  async adjust(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const parsed = adjustSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const { currency, ...rest } = parsed.data;
    return this.service.adjust(this.requireCtx(req), id, {
      ...rest,
      ...(currency !== undefined ? { currency } : {}),
    });
  }
}
