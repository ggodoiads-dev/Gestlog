import { Module } from '@nestjs/common';

import { RoutesController } from './routes.controller';
import { RoutesService } from './routes.service';
import { RouteVersionsController } from './route-versions.controller';

@Module({
  controllers: [RoutesController, RouteVersionsController],
  providers: [RoutesService],
  exports: [RoutesService],
})
export class RoutingModule {}
