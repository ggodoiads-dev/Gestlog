import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { AssignmentsService } from './assignments.service';
import { createAssignmentSchema } from './autodispatch.dto';

@ApiTags('autodispatch')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller()
export class AssignmentsController {
  constructor(
    private readonly service: AssignmentsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private requireCtx(req: Request): { tenantId: string; userId: string } {
    const ctx = this.tenantContext.fromRequest(req as never);
    if (!ctx) throw new Error('contexto ausente após autenticação');
    return ctx;
  }

  @Post('scheduled-trips/:tripId/assignments')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('operations.trips.dispatch')
  @ApiOperation({ summary: 'Designa motorista + veículo a uma viagem programada (atômico)' })
  async propose(
    @Req() req: Request,
    @Param('tripId') tripId: string,
    @Body() body: unknown,
  ) {
    const parsed = createAssignmentSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join('; '));
    }
    return this.service.propose(this.requireCtx(req), tripId, parsed.data);
  }

  @Delete('assignments/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('operations.trips.dispatch')
  @ApiOperation({ summary: 'Cancela uma designação ativa (libera a viagem)' })
  async cancel(@Req() req: Request, @Param('id') id: string, @Query('reason') reason?: string) {
    if (!reason || reason.trim().length < 3) {
      throw new BadRequestException('query `reason` obrigatório (mín. 3 caracteres)');
    }
    return this.service.cancel(this.requireCtx(req), id, reason);
  }
}
