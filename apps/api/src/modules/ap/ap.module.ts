import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { PayablesController } from './payables.controller';
import { PayablesService } from './payables.service';

@Module({
  imports: [AuditModule],
  controllers: [PayablesController],
  providers: [PayablesService],
  exports: [PayablesService],
})
export class ApModule {}
