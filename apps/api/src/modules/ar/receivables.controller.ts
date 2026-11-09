import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
  competenceYear: z.number().int().min(2000).max(2100),
  competenceMonth: z.number().int().min(1).max(12),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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
}
