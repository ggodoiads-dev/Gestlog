import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

import { HealthModule } from './health/health.module.js';
import { TenantContextModule } from './tenant-context/tenant-context.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : {
                target: 'pino-pretty',
                options: { singleLine: true, colorize: true },
              },
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
    HealthModule,
  ],
})
export class AppModule {}
