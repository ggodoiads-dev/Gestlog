import { Module } from '@nestjs/common';

import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { EligibilityService } from './eligibility.service';

@Module({
  controllers: [VehiclesController],
  providers: [VehiclesService, EligibilityService],
  exports: [VehiclesService, EligibilityService],
})
export class FleetModule {}
