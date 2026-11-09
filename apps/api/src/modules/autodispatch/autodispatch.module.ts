import { Module } from '@nestjs/common';

import { ComplianceModule } from '../compliance/compliance.module';
import { FleetModule } from '../fleet/fleet.module';
import { WorkforceModule } from '../workforce/workforce.module';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';

@Module({
  imports: [WorkforceModule, FleetModule, ComplianceModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
  exports: [AssignmentsService],
})
export class AutoDispatchModule {}
