import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { TenantContextMiddleware } from './auth/tenant-context.middleware';
import { HealthModule } from './health/health.module';
import { ArModule } from './modules/ar/ar.module';
import { AutoDispatchModule } from './modules/autodispatch/autodispatch.module';
import { BillingModule } from './modules/billing/billing.module';
import { ClientsModule } from './modules/clients/clients.module';
import { CoreModule } from './modules/core/core.module';
import { FleetModule } from './modules/fleet/fleet.module';
import { OperationsModule } from './modules/operations/operations.module';
import { RoutingModule } from './modules/routing/routing.module';
import { WorkforceModule } from './modules/workforce/workforce.module';
import { PrismaModule } from './prisma/prisma.module';
import { TenantContextModule } from './tenant-context/tenant-context.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        ...(process.env.NODE_ENV === 'production'
          ? {}
          : {
              transport: {
                target: 'pino-pretty',
                options: { singleLine: true, colorize: true },
              },
            }),
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.passwordHash',
            'req.body.token',
            'res.headers["set-cookie"]',
          ],
          remove: true,
        },
        customProps: (req) => ({
          tenantId: (req as { tenantId?: string }).tenantId,
          correlationId: (req as { correlationId?: string }).correlationId,
        }),
      },
    }),
    TenantContextModule,
    PrismaModule,
    AuthModule,
    HealthModule,
    CoreModule,
    ClientsModule,
    RoutingModule,
    FleetModule,
    WorkforceModule,
    OperationsModule,
    AutoDispatchModule,
    BillingModule,
    ArModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
