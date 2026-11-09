import {
  BadRequestException,
  Body,
  Controller,
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
import { ReceiptsService } from './receipts.service';

const registerSchema = z.object({
  amountCents: z.coerce.bigint().positive(),
  receivedAt: z.string().datetime().optional(),
  source: z.enum(['MANUAL', 'BANK_OFX', 'BANK_API', 'PIX']).default('MANUAL'),
  reference: z.string().max(200).optional(),
});

@ApiTags('ar')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('receivables/:id/receipts')
export class ReceiptsController {
  constructor(
    private readonly service: ReceiptsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ar.receivables.write')
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Mín. 16 caracteres' })
  @ApiOperation({ summary: 'Registra pagamento alocado ao receivable' })
  async register(
    @Req() req: Request,
    @Param('id') receivableId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    const ctx = this.tenantContext.fromRequest(req as never);
    if (!ctx) throw new Error('contexto ausente após autenticação');

    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const receivedAt = parsed.data.receivedAt
      ? new Date(parsed.data.receivedAt)
      : new Date();
    return this.service.register(ctx, {
      receivableId,
      idempotencyKey: idempotencyKey ?? '',
      amountCents: parsed.data.amountCents,
      receivedAt,
      source: parsed.data.source,
      ...(parsed.data.reference !== undefined ? { reference: parsed.data.reference } : {}),
    });
  }
}
