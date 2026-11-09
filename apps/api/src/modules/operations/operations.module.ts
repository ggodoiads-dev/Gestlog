import { Module } from '@nestjs/common';

import { ScheduledTripsController } from './scheduled-trips.controller';
import { ScheduledTripsService } from './scheduled-trips.service';

@Module({
  controllers: [ScheduledTripsController],
  providers: [ScheduledTripsService],
  exports: [ScheduledTripsService],
})
export class OperationsModule {}
