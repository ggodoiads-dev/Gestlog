import { execSync } from 'node:child_process';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PrismaClient } from '@prisma/client';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';

// Em ambientes novos (Railway), executa ANTES do NestFactory:
//   1. cria as roles RLS (idempotente);
//   2. limpa entradas de _prisma_migrations em estado "started" (finished_at NULL);
//   3. roda `prisma migrate deploy`.
// Fica no main.ts porque arquivos avulsos no src/ podem não entrar na imagem
// final (Railpack mantém apenas arquivos referenciados a partir do entrypoint).
// Opt-in via GESTLOG_RUN_MIGRATIONS=true — assim dev local não é afetado.
async function runRailwayBootstrap(): Promise<void> {
  if (process.env.GESTLOG_RUN_MIGRATIONS !== 'true') return;
  const appPwd = process.env.GESTLOG_APP_PASSWORD;
  const adminPwd = process.env.GESTLOG_ADMIN_PASSWORD;
  if (!appPwd || !adminPwd) {
    // eslint-disable-next-line no-console
    console.error('bootstrap: faltam GESTLOG_APP_PASSWORD / GESTLOG_ADMIN_PASSWORD');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(
      `DO $$ BEGIN
         CREATE ROLE gestlog_app LOGIN PASSWORD '${appPwd}' NOBYPASSRLS;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
    await prisma.$executeRawUnsafe(
      `DO $$ BEGIN
         CREATE ROLE gestlog_admin LOGIN PASSWORD '${adminPwd}' BYPASSRLS;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );

    const dbRows = await prisma.$queryRawUnsafe<{ d: string }[]>(
      'SELECT current_database() AS d',
    );
    const dbname = dbRows[0]?.d ?? 'railway';
    await prisma.$executeRawUnsafe(
      `GRANT CONNECT ON DATABASE "${dbname}" TO gestlog_app, gestlog_admin;`,
    );

    const tblRows = await prisma.$queryRawUnsafe<{ ok: number }[]>(
      "SELECT 1 AS ok FROM information_schema.tables WHERE table_name = '_prisma_migrations'",
    );
    if (tblRows.length > 0) {
      type Row = { migration_name: string };
      const rolled = await prisma.$queryRawUnsafe<Row[]>(
        'DELETE FROM _prisma_migrations WHERE finished_at IS NULL RETURNING migration_name',
      );
      if (rolled.length > 0) {
        // eslint-disable-next-line no-console
        console.log(
          'bootstrap: limpou migrations falhadas: ' +
            rolled.map((r) => r.migration_name).join(', '),
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  // eslint-disable-next-line no-console
  console.log('bootstrap: roles ok. Rodando prisma migrate deploy…');
  execSync('pnpm --filter @gestlog/db prisma:migrate:deploy', {
    stdio: 'inherit',
    cwd: '/app',
  });
}

async function bootstrap(): Promise<void> {
  await runRailwayBootstrap();

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
