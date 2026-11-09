import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { PermissionsGuard, RequirePermissions } from '../../auth/permissions.decorator';
import { TenantContextService } from '../../tenant-context/tenant-context.service';
import { BillingService } from './billing.service';

@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller()
export class BillingController {
  constructor(
    private readonly service: BillingService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private requireCtx(req: Request): { tenantId: string; userId: string } {
    const ctx = this.tenantContext.fromRequest(req as never);
    if (!ctx) throw new Error('contexto ausente após autenticação');
    return ctx;
  }

  @Post('scheduled-trips/:tripId/validate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('operations.trips.validate')
  @ApiOperation({
    summary:
      'Marca a viagem como validada e gera a medição contratual conforme o preço vigente',
  })
  async validate(@Req() req: Request, @Param('tripId') tripId: string) {
    return this.service.validateAndMeasure(this.requireCtx(req), tripId);
  }

  @Get('billing/pre-invoices/:contractId')
  @RequirePermissions('clm.contracts.read')
  @ApiOperation({ summary: 'Pré-fatura: medições agregadas para contrato × competência' })
  async preInvoice(
    @Req() req: Request,
    @Param('contractId') contractId: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const y = year ? Number.parseInt(year, 10) : NaN;
    const m = month ? Number.parseInt(month, 10) : NaN;
    if (!Number.isInteger(y) || y < 2000 || y > 2100) {
      throw new BadRequestException('query `year` inválido');
    }
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      throw new BadRequestException('query `month` deve ser 1..12');
    }
    return this.service.preInvoice(this.requireCtx(req), contractId, y, m);
  }
}
