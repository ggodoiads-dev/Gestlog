import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { PermissionsGuard, RequirePermissions } from '../../auth/permissions.decorator';
import { TenantContextService } from '../../tenant-context/tenant-context.service';
import {
  CreateTankDto,
  RegisterFillDto,
  RegisterPurchaseDto,
  RegisterTransferDto,
} from './fuel.dto';
import { FuelService } from './fuel.service';

@ApiTags('fuel')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('fuel')
export class FuelController {
  constructor(
    private readonly service: FuelService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private requireCtx(req: Request): { tenantId: string; userId: string } {
    const ctx = this.tenantContext.fromRequest(req as never);
    if (!ctx) throw new Error('contexto ausente após autenticação');
    return ctx;
  }

  @Get('tanks')
  @RequirePermissions('fuel.tanks.read')
  async listTanks(@Req() req: Request): Promise<unknown> {
    return this.service.listTanks(this.requireCtx(req));
  }

  @Post('tanks')
  @RequirePermissions('fuel.tanks.manage')
  async createTank(@Req() req: Request, @Body() dto: CreateTankDto): Promise<unknown> {
    return this.service.createTank(this.requireCtx(req), dto);
  }

  @Get('tanks/:id/statement')
  @RequirePermissions('fuel.tanks.read')
  async statement(@Req() req: Request, @Param('id') id: string): Promise<unknown> {
    return this.service.tankStatement(this.requireCtx(req), id);
  }

  @Post('tanks/:id/purchases')
  @RequirePermissions('fuel.purchases.write')
  async registerPurchase(
    @Req() req: Request,
    @Param('id') tankId: string,
    @Body() dto: RegisterPurchaseDto,
  ): Promise<unknown> {
    return this.service.registerPurchase(this.requireCtx(req), tankId, dto);
  }

  @Post('purchases/:id/approve')
  @RequirePermissions('fuel.purchases.approve')
  async approvePurchase(@Req() req: Request, @Param('id') id: string): Promise<unknown> {
    return this.service.approvePurchase(this.requireCtx(req), id);
  }

  @Post('purchases/:id/reject')
  @RequirePermissions('fuel.purchases.approve')
  async rejectPurchase(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ): Promise<unknown> {
    if (!body?.reason) throw new BadRequestException('reason obrigatório');
    return this.service.rejectPurchase(this.requireCtx(req), id, body.reason);
  }

  @Post('tanks/:id/fills')
  @RequirePermissions('fuel.fills.write')
  async registerFill(
    @Req() req: Request,
    @Param('id') tankId: string,
    @Body() dto: RegisterFillDto,
  ): Promise<unknown> {
    return this.service.registerFill(this.requireCtx(req), tankId, dto);
  }

  @Post('transfers')
  @RequirePermissions('fuel.transfers.write')
  async transfer(@Req() req: Request, @Body() dto: RegisterTransferDto): Promise<unknown> {
    return this.service.transfer(this.requireCtx(req), dto);
  }
}
