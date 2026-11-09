import {
  BadRequestException,
  Body,
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
import { FinanceService } from './finance.service';

@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('finance')
export class FinanceController {
  constructor(
    private readonly service: FinanceService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private requireCtx(req: Request): { tenantId: string; userId: string } {
    const ctx = this.tenantContext.fromRequest(req as never);
    if (!ctx) throw new Error('contexto ausente após autenticação');
    return ctx;
  }

  private parseYearMonth(year?: string, month?: string): { y: number; m: number } {
    const y = year ? Number.parseInt(year, 10) : NaN;
    const m = month ? Number.parseInt(month, 10) : NaN;
    if (!Number.isInteger(y)) throw new BadRequestException('query `year` inválido');
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      throw new BadRequestException('query `month` deve ser 1..12');
    }
    return { y, m };
  }

  @Get('dre')
  @RequirePermissions('finance.periods.read')
  @ApiOperation({ summary: 'DRE/EBITDA por pessoa jurídica e competência (live ou snapshot)' })
  async dre(
    @Req() req: Request,
    @Query('legalEntityId') legalEntityId: string,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    if (!legalEntityId) throw new BadRequestException('query `legalEntityId` obrigatório');
    const { y, m } = this.parseYearMonth(year, month);
    return this.service.dre(this.requireCtx(req), legalEntityId, y, m);
  }

  @Post('periods/:legalEntityId/:year/:month/close')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('finance.periods.close')
  @ApiOperation({ summary: 'Fecha a competência: snapshot EBITDA imutável + bloqueia novas medições' })
  async close(
    @Req() req: Request,
    @Param('legalEntityId') legalEntityId: string,
    @Param('year') year: string,
    @Param('month') month: string,
  ) {
    const { y, m } = this.parseYearMonth(year, month);
    return this.service.close(this.requireCtx(req), legalEntityId, y, m);
  }

  @Post('periods/:legalEntityId/:year/:month/reopen')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('finance.periods.reopen')
  @ApiOperation({ summary: 'Reabre competência fechada com justificativa' })
  async reopen(
    @Req() req: Request,
    @Param('legalEntityId') legalEntityId: string,
    @Param('year') year: string,
    @Param('month') month: string,
    @Body() body: { reason?: string } | undefined,
  ) {
    const { y, m } = this.parseYearMonth(year, month);
    return this.service.reopen(this.requireCtx(req), legalEntityId, y, m, body?.reason ?? '');
  }
}
