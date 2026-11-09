import { Module } from '@nestjs/common';

import { FleetModule } from '../fleet/fleet.module';
import { WorkforceModule } from '../workforce/workforce.module';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';

@Module({
  imports: [WorkforceModule, FleetModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
  exports: [AssignmentsService],
})
export class AutoDispatchModule {}
