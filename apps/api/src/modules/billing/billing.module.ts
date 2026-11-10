import { Module } from '@nestjs/common';

import { ClmModule } from '../clm/clm.module';
import { FinanceModule } from '../finance/finance.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [FinanceModule, ClmModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
