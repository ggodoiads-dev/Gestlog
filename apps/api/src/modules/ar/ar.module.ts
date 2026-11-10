import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { BillingModule } from '../billing/billing.module';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';
import { ReceivablesController } from './receivables.controller';
import { ReceivablesService } from './receivables.service';

@Module({
  imports: [BillingModule, AuditModule],
  controllers: [ReceivablesController, ReceiptsController],
  providers: [ReceivablesService, ReceiptsService],
  exports: [ReceivablesService, ReceiptsService],
})
export class ReceivablesModule {}
