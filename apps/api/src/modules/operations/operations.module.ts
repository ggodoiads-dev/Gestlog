import { Module } from '@nestjs/common';

import { OperationalEventsController } from './operational-events.controller';
import { OperationalEventsService } from './operational-events.service';
import { ScheduledTripsController } from './scheduled-trips.controller';
import { ScheduledTripsService } from './scheduled-trips.service';

@Module({
  controllers: [ScheduledTripsController, OperationalEventsController],
  providers: [ScheduledTripsService, OperationalEventsService],
  exports: [ScheduledTripsService, OperationalEventsService],
})
export class OperationsModule {}
