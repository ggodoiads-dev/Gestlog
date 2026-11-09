import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  liveness(): { status: 'ok'; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  readiness(): {
    status: 'ok' | 'degraded';
    timestamp: string;
    checks: Record<string, 'ok' | 'pending' | 'fail'>;
  } {
    // Checks reais (DB, Redis, filas, migrations) virão com a camada de
    // infraestrutura integrada. Por ora a readiness reporta apenas
    // os componentes já implementados — honestidade de estado é regra.
    return {
      status: 'degraded',
      timestamp: new Date().toISOString(),
      checks: {
        process: 'ok',
        database: 'pending',
        redis: 'pending',
        migrations: 'pending',
      },
    };
  }

  @Get('integrations')
  integrations(): {
    status: 'pending';
    note: string;
    integrations: Record<string, 'not-configured'>;
  } {
    // Ver docs/INTEGRATION_CONTRACTS.md — nenhuma integração configurada.
    return {
      status: 'pending',
      note: 'Nenhuma integração externa homologada ainda. Ver docs/INTEGRATION_CONTRACTS.md.',
      integrations: {
        'nfs-e': 'not-configured',
        'ct-e-os': 'not-configured',
        'open-finance': 'not-configured',
        'bank-payments': 'not-configured',
        pix: 'not-configured',
        telematics: 'not-configured',
        'e-signature': 'not-configured',
        email: 'not-configured',
      },
    };
  }
}
