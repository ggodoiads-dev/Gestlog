import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready', 'health/integrations'] });

  const config = new DocumentBuilder()
    .setTitle('GESTLOG API')
    .setDescription('API multi-tenant do GESTLOG — módulo core e operações.')
    .setVersion('0.0.0')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, doc);

  // Railway seta PORT; API_PORT fica como fallback para dev local.
  const port = Number.parseInt(process.env.PORT ?? process.env.API_PORT ?? '4000', 10);

  // CORS para a web (Vercel). WEB_ORIGINS é lista separada por vírgula.
  // Wildcards simples suportados (ex.: "https://gestlog-*.vercel.app").
  const origins = (process.env.WEB_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (origins.length > 0) {
    app.enableCors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        const allowed = origins.some((pattern) => {
          if (pattern === origin) return true;
          if (pattern.includes('*')) {
            const regex = new RegExp(
              '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
            );
            return regex.test(origin);
          }
          return false;
        });
        cb(null, allowed);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'],
    });
  }

  await app.listen(port, '0.0.0.0');
  app.get(Logger).log(`GESTLOG API escutando em porta ${port}`);
}

bootstrap().catch((err: unknown) => {
  console.error('Falha no bootstrap:', err);
  process.exit(1);
});
