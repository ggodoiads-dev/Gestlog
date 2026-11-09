import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TenantContextMiddleware } from './tenant-context.middleware';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get<string>('AUTH_SECRET') ?? 'dev-only-change-me-32chars-xxxxxxxxxx',
        signOptions: {
          expiresIn: cfg.get<string>('SESSION_MAX_AGE_SECONDS') ?? '28800',
          issuer: 'gestlog',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, TenantContextMiddleware],
  exports: [AuthService, JwtAuthGuard, JwtModule, TenantContextMiddleware],
})
export class AuthModule {}
