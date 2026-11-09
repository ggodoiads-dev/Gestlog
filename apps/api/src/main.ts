import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';

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

  const port = Number.parseInt(process.env.API_PORT ?? '4000', 10);
  await app.listen(port);
  app.get(Logger).log(`GESTLOG API escutando em http://localhost:${port}`);
}

bootstrap().catch((err: unknown) => {
  console.error('Falha no bootstrap:', err);
  process.exit(1);
});
