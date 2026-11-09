import { Module } from '@nestjs/common';

import { TenantContextService } from './tenant-context.service.js';

@Module({
  providers: [TenantContextService],
  exports: [TenantContextService],
})
export class TenantContextModule {}
