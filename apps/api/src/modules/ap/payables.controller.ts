import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';

import { PermissionsGuard, RequirePermissions } from '../../auth/permissions.decorator';
import { TenantContextService } from '../../tenant-context/tenant-context.service';
import { PayablesService } from './payables.service';

const createSchema = z.object({
  orderId: z.string().uuid().optional(),
  supplierName: z.string().min(2).max(200),
  supplierCnpj: z.string().regex(/^\d{14}$/).optional(),
  description: z.string().min(2).max(500),
  amountCents: z.coerce.bigint().positive(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paymentApprovalId: z.string().uuid().optional(),
});

const paySchema = z.object({
  amountCents: z.coerce.bigint().positive(),
  method: z.enum(['MANUAL', 'BANK_API', 'PIX', 'OFX_IMPORT']).default('MANUAL'),
  externalStatus: z.enum(['CONFIRMED', 'PROCESSING', 'UNKNOWN']).default('CONFIRMED'),
  paidAt: z.string().datetime().optional(),
  reference: z.string().max(200).optional(),
});

@ApiTags('ap')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller()
export class PayablesController {
  constructor(
    private readonly service: PayablesService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private requireCtx(req: Request): { tenantId: string; userId: string } {
    const ctx = this.tenantContext.fromRequest(req as never);
    if (!ctx) throw new Error('contexto ausente após autenticação');
    return ctx;
  }

  @Get('payables')
  @RequirePermissions('ap.payables.read')
  @ApiOperation({ summary: 'Lista contas a pagar em aberto' })
  async list(@Req() req: Request) {
    return this.service.list(this.requireCtx(req));
  }

  @Post('payables')
  @RequirePermissions('ap.payables.manage')
  @ApiOperation({ summary: 'Lança uma conta a pagar (opcionalmente vinculada a pedido)' })
  async create(@Req() req: Request, @Body() body: unknown) {
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join('; '));
    }
    return this.service.createPayable(this.requireCtx(req), {
      ...parsed.data,
      dueDate: new Date(`${parsed.data.dueDate}T00:00:00Z`),
    });
  }

  @Post('payables/:id/payments')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ap.payments.execute')
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Mín. 16 caracteres' })
  @ApiOperation({
    summary:
      'Executa pagamento com Idempotency-Key obrigatória. externalStatus UNKNOWN NÃO atualiza saldo.',
  })
  async pay(
    @Req() req: Request,
    @Param('id') payableId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    const parsed = paySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join('; '));
    }
    return this.service.pay(this.requireCtx(req), {
      payableId,
      idempotencyKey: idempotencyKey ?? '',
      amountCents: parsed.data.amountCents,
      method: parsed.data.method,
      externalStatus: parsed.data.externalStatus,
      paidAt: parsed.data.paidAt ? new Date(parsed.data.paidAt) : new Date(),
      ...(parsed.data.reference !== undefined ? { reference: parsed.data.reference } : {}),
    });
  }
}
