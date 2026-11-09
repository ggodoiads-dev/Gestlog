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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { PermissionsGuard, RequirePermissions } from '../../auth/permissions.decorator';
import { TenantContextService } from '../../tenant-context/tenant-context.service';
import {
  CreateAssetDto,
  CreateFinancingDto,
  DisposeDto,
  LifeReviewDto,
} from './assets.dto';
import { AssetsService } from './assets.service';

@ApiTags('assets')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('assets')
export class AssetsController {
  constructor(
    private readonly service: AssetsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private requireCtx(req: Request): { tenantId: string; userId: string } {
    const ctx = this.tenantContext.fromRequest(req as never);
    if (!ctx) throw new Error('contexto ausente após autenticação');
    return ctx;
  }

  @Get()
  @RequirePermissions('assets.read')
  async list(@Req() req: Request): Promise<unknown> {
    return this.service.listAssets(this.requireCtx(req));
  }

  @Post()
  @RequirePermissions('assets.manage')
  async create(@Req() req: Request, @Body() dto: CreateAssetDto): Promise<unknown> {
    return this.service.createAsset(this.requireCtx(req), dto);
  }

  @Post(':id/financings')
  @RequirePermissions('assets.manage')
  async addFinancing(
    @Req() req: Request,
    @Param('id') assetId: string,
    @Body() dto: CreateFinancingDto,
  ): Promise<unknown> {
    return this.service.addFinancing(this.requireCtx(req), assetId, dto);
  }

  @Post(':id/life-reviews')
  @RequirePermissions('assets.life.review')
  async lifeReview(
    @Req() req: Request,
    @Param('id') assetId: string,
    @Body() dto: LifeReviewDto,
  ): Promise<unknown> {
    return this.service.addLifeReview(this.requireCtx(req), assetId, dto);
  }

  @Post(':id/dispose')
  @RequirePermissions('assets.dispose')
  async dispose(
    @Req() req: Request,
    @Param('id') assetId: string,
    @Body() dto: DisposeDto,
  ): Promise<unknown> {
    return this.service.dispose(this.requireCtx(req), assetId, dto);
  }

  @Post('depreciation/:year/:month')
  @RequirePermissions('assets.depreciation.compute')
  async compute(
    @Req() req: Request,
    @Param('year') year: string,
    @Param('month') month: string,
  ): Promise<unknown> {
    const y = Number.parseInt(year, 10);
    const m = Number.parseInt(month, 10);
    if (!Number.isInteger(y) || !Number.isInteger(m)) {
      throw new BadRequestException('year/month inválidos');
    }
    return this.service.computeMonthlyDepreciation(this.requireCtx(req), y, m);
  }
}
