import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { ApprovalsService } from './approvals.service';
import { createApprovalSchema, decisionSchema } from './governance.dto';

@ApiTags('governance')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('approvals')
export class ApprovalsController {
  constructor(
    private readonly service: ApprovalsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private requireCtx(req: Request): { tenantId: string; userId: string } {
    const ctx = this.tenantContext.fromRequest(req as never);
    if (!ctx) throw new Error('contexto ausente após autenticação');
    return ctx;
  }

  @Get()
  @RequirePermissions('governance.approvals.read')
  @ApiOperation({ summary: 'Lista pedidos de aprovação' })
  async list(
    @Req() req: Request,
    @Query('state')
    state?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'RETURNED' | 'CANCELLED' | 'SUPERSEDED',
  ) {
    return this.service.list(this.requireCtx(req), state);
  }

  @Get(':id')
  @RequirePermissions('governance.approvals.read')
  @ApiOperation({ summary: 'Detalhe de um pedido de aprovação' })
  async detail(@Req() req: Request, @Param('id') id: string) {
    return this.service.detail(this.requireCtx(req), id);
  }

  @Post()
  @RequirePermissions('governance.approvals.request')
  @ApiOperation({ summary: 'Abre um pedido de aprovação' })
  async create(@Req() req: Request, @Body() body: unknown) {
    const parsed = createApprovalSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join('; '));
    }
    return this.service.create(this.requireCtx(req), parsed.data);
  }

  @Post(':id/decisions')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('governance.approvals.decide')
  @ApiOperation({ summary: 'Registra decisão (APPROVE/REJECT/RETURN) sobre o pedido' })
  async decide(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const parsed = decisionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join('; '));
    }
    return this.service.decide(this.requireCtx(req), id, parsed.data);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('governance.approvals.request')
  @ApiOperation({ summary: 'Cancela um pedido PENDING (somente o solicitante)' })
  async cancel(@Req() req: Request, @Param('id') id: string, @Query('reason') reason?: string) {
    return this.service.cancel(this.requireCtx(req), id, reason ?? '');
  }
}
