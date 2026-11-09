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
import { PurchaseOrdersService } from './purchase-orders.service';

const createSchema = z.object({
  legalEntityId: z.string().uuid(),
  code: z.string().min(1).max(32),
  supplierName: z.string().min(2).max(200),
  supplierCnpj: z.string().regex(/^\d{14}$/).optional(),
  description: z.string().min(2).max(500),
  amountCents: z.coerce.bigint().positive(),
  currency: z.string().length(3).optional(),
  approvalId: z.string().uuid().optional(),
});

const receiveSchema = z.object({
  amountCents: z.coerce.bigint().positive(),
  receivedAt: z.string().datetime().optional(),
  reference: z.string().max(200).optional(),
});

@ApiTags('procurement')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(
    private readonly service: PurchaseOrdersService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private requireCtx(req: Request): { tenantId: string; userId: string } {
    const ctx = this.tenantContext.fromRequest(req as never);
    if (!ctx) throw new Error('contexto ausente após autenticação');
    return ctx;
  }

  @Get()
  @RequirePermissions('procurement.orders.read')
  @ApiOperation({ summary: 'Lista pedidos de compra do tenant' })
  async list(@Req() req: Request) {
    return this.service.list(this.requireCtx(req));
  }

  @Post()
  @RequirePermissions('procurement.orders.manage')
  @ApiOperation({ summary: 'Cria pedido de compra (opcionalmente vinculado a uma aprovação)' })
  async create(@Req() req: Request, @Body() body: unknown) {
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join('; '));
    }
    return this.service.create(this.requireCtx(req), parsed.data);
  }

  @Get(':id')
  @RequirePermissions('procurement.orders.read')
  @ApiOperation({ summary: 'Detalhe do pedido + recebimentos' })
  async detail(@Req() req: Request, @Param('id') id: string) {
    const found = await this.service.detail(this.requireCtx(req), id);
    if (!found) throw new NotFoundException('pedido não encontrado');
    return found;
  }

  @Post(':id/receipts')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('procurement.receive')
  @ApiOperation({ summary: 'Registra recebimento parcial/total; não permite overreceive' })
  async receive(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const parsed = receiveSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join('; '));
    }
    return this.service.receive(this.requireCtx(req), id, {
      amountCents: parsed.data.amountCents,
      receivedAt: parsed.data.receivedAt ? new Date(parsed.data.receivedAt) : new Date(),
      ...(parsed.data.reference !== undefined ? { reference: parsed.data.reference } : {}),
    });
  }
}
