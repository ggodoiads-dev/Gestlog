import {
  BadRequestException,
  Body,
  Controller,
  Get,
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
import {
  CreateBankAccountDto,
  ImportStatementDto,
  MatchDto,
} from './treasury.dto';
import { TreasuryService } from './treasury.service';

@ApiTags('treasury')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller()
export class TreasuryController {
  constructor(
    private readonly service: TreasuryService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private requireCtx(req: Request): { tenantId: string; userId: string } {
    const ctx = this.tenantContext.fromRequest(req as never);
    if (!ctx) throw new Error('contexto ausente após autenticação');
    return ctx;
  }

  @Get('bank-accounts')
  @RequirePermissions('finance.bank.read')
  @ApiOperation({ summary: 'Listar contas bancárias com saldo' })
  async listAccounts(@Req() req: Request): Promise<unknown> {
    return this.service.listAccounts(this.requireCtx(req));
  }

  @Post('bank-accounts')
  @RequirePermissions('finance.bank.manage')
  async createAccount(
    @Req() req: Request,
    @Body() dto: CreateBankAccountDto,
  ): Promise<unknown> {
    return this.service.createAccount(this.requireCtx(req), dto);
  }

  @Post('bank-accounts/:id/statements')
  @RequirePermissions('finance.bank.import')
  async importStatement(
    @Req() req: Request,
    @Param('id') bankAccountId: string,
    @Body() dto: ImportStatementDto,
  ): Promise<unknown> {
    return this.service.importStatement(this.requireCtx(req), bankAccountId, dto);
  }

  @Get('bank-accounts/:id/transactions/pending')
  @RequirePermissions('finance.bank.read')
  async pending(@Req() req: Request, @Param('id') bankAccountId: string): Promise<unknown> {
    return this.service.listPending(this.requireCtx(req), bankAccountId);
  }

  @Post('bank-transactions/:id/match')
  @RequirePermissions('finance.bank.reconcile')
  async match(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: MatchDto,
  ): Promise<unknown> {
    return this.service.match(this.requireCtx(req), id, dto);
  }

  @Post('bank-transactions/:id/unmatch')
  @RequirePermissions('finance.bank.reconcile')
  async unmatch(@Req() req: Request, @Param('id') id: string): Promise<unknown> {
    return this.service.unmatch(this.requireCtx(req), id);
  }

  @Post('bank-transactions/:id/ignore')
  @RequirePermissions('finance.bank.reconcile')
  async ignore(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ): Promise<unknown> {
    if (!body?.reason) throw new BadRequestException('reason obrigatório');
    return this.service.ignore(this.requireCtx(req), id, body.reason);
  }
}
