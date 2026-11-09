import { Module } from '@nestjs/common';

import { BillingModule } from '../billing/billing.module';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';
import { ReceivablesController } from './receivables.controller';
import { ReceivablesService } from './receivables.service';

@Module({
  imports: [BillingModule],
  controllers: [ReceivablesController, ReceiptsController],
  providers: [ReceivablesService, ReceiptsService],
  exports: [ReceivablesService, ReceiptsService],
})
export class ReceivablesModule {}
