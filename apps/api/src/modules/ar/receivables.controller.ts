import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { ReceivablesService } from './receivables.service';

const issueSchema = z.object({
  competenceYear: z.number().int().min(2000).max(2500),
  competenceMonth: z.number().int().min(1).max(12),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const disputeSchema = z.object({
  contestedCents: z.number().int().nonnegative(),
  reason: z.string().min(3).max(500),
});

const anticipateSchema = z.object({
  reference: z.string().min(3).max(200),
});

@ApiTags('ar')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller()
export class ReceivablesController {
  constructor(
    private readonly service: ReceivablesService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private requireCtx(req: Request): { tenantId: string; userId: string } {
    const ctx = this.tenantContext.fromRequest(req as never);
    if (!ctx) throw new Error('contexto ausente após autenticação');
    return ctx;
  }

  @Post('billing/pre-invoices/:contractId/issue')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('ar.receivables.issue')
  @ApiOperation({
    summary: 'Emite um Receivable a partir da pré-fatura (contract × competência)',
  })
  async issue(
    @Req() req: Request,
    @Param('contractId') contractId: string,
    @Body() body: unknown,
  ) {
    const parsed = issueSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join('; '));
    }
    return this.service.issueFromPreInvoice(
      this.requireCtx(req),
      contractId,
      parsed.data.competenceYear,
      parsed.data.competenceMonth,
      parsed.data.dueDate ? { dueDate: parsed.data.dueDate } : {},
    );
  }

  @Get('receivables')
  @RequirePermissions('ar.receivables.read')
  @ApiOperation({ summary: 'Lista recebíveis em aberto do tenant' })
  async listOpen(@Req() req: Request) {
    return this.service.listOpen(this.requireCtx(req));
  }

  @Get('receivables/:id')
  @RequirePermissions('ar.receivables.read')
  @ApiOperation({ summary: 'Detalhe do recebível + histórico de alocações' })
  async detail(@Req() req: Request, @Param('id') id: string) {
    const r = await this.service.detail(this.requireCtx(req), id);
    if (!r) throw new NotFoundException('recebível não encontrado');
    return r;
  }

  @Post('receivables/:id/dispute')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('ar.receivables.dispute')
  @ApiOperation({ summary: 'AT-23: registra ou resolve contestação' })
  async dispute(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const parsed = disputeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join('; '));
    }
    return this.service.dispute(this.requireCtx(req), id, parsed.data);
  }

  @Post('receivables/:id/anticipate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('ar.receivables.anticipate')
  @ApiOperation({ summary: 'AT-25: marca o recebível como antecipado' })
  async anticipate(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const parsed = anticipateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join('; '));
    }
    return this.service.anticipate(this.requireCtx(req), id, parsed.data);
  }
}
