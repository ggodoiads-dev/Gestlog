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

import { PermissionsGuard, RequirePermissions } from '../../auth/permissions.decorator';
import { TenantContextService } from '../../tenant-context/tenant-context.service';
import { submitEventSchema } from './operational-events.dto';
import { OperationalEventsService } from './operational-events.service';

@ApiTags('operations')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('scheduled-trips/:tripId/events')
export class OperationalEventsController {
  constructor(
    private readonly service: OperationalEventsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('operations.events.submit')
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Mín. 16 caracteres' })
  @ApiOperation({
    summary:
      'Submete um evento operacional (driver app). Retorna o evento canônico; dedupe por Idempotency-Key.',
  })
  async submit(
    @Req() req: Request,
    @Param('tripId') tripId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    const ctx = this.tenantContext.fromRequest(req as never);
    if (!ctx) throw new Error('contexto ausente após autenticação');

    const parsed = submitEventSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    }
    return this.service.submit(ctx, tripId, idempotencyKey ?? '', parsed.data);
  }
}
