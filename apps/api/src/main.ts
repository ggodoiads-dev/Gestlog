import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PrismaClient } from '@prisma/client';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';

// Divide um script Postgres em statements individuais, respeitando blocos
// `$$ ... $$` (DO blocks, bodies de FUNCTION) que podem conter ; internos.
// Também ignora `--` até fim de linha e tolera tags dollar-quoted `$tag$`.
function splitPostgresStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = '';
  let i = 0;
  const n = sql.length;
  let dollarTag: string | null = null; // null = fora de bloco $$; string = tag atual
  while (i < n) {
    // Comentário de linha
    if (dollarTag === null && sql[i] === '-' && sql[i + 1] === '-') {
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }
    // Entrada/saída de bloco dollar-quoted
    if (sql[i] === '$') {
      const m = sql.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (m) {
        const tag = m[1] ?? '';
        if (dollarTag === null) {
          dollarTag = tag;
        } else if (dollarTag === tag) {
          dollarTag = null;
        }
        buf += m[0];
        i += m[0].length;
        continue;
      }
    }
    if (dollarTag === null && sql[i] === ';') {
      const t = buf.trim();
      if (t) out.push(t);
      buf = '';
      i++;
      continue;
    }
    buf += sql[i];
    i++;
  }
  const t = buf.trim();
  if (t) out.push(t);
  return out;
}

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
  const dbUrl = process.env.DATABASE_URL;
  const superuserUrl = process.env.DATABASE_SUPERUSER_URL;
  if (!appPwd || !adminPwd || !dbUrl || !superuserUrl) {
    // eslint-disable-next-line no-console
    console.error(
      'bootstrap: faltam GESTLOG_APP_PASSWORD / GESTLOG_ADMIN_PASSWORD / DATABASE_URL / DATABASE_SUPERUSER_URL',
    );
    process.exit(1);
  }

  // A migration 20261109003216 tem `GRANT CONNECT ON DATABASE gestlog` hardcoded.
  // O Postgres do Railway nasce com um DB chamado "railway"; criamos "gestlog"
  // à parte para que as migrations rodem iguais a dev local.
  const target = 'gestlog';
  // adminUrl = DATABASE_URL já apontando pra "gestlog" (as env vars DATABASE_*
  // foram configuradas assim). superuserUrl aponta para o DB inicial.
  const adminUrl = dbUrl;

  // Fase 1: conecta no DB inicial. Se GESTLOG_FORCE_RESET=true, dropa e recria.
  // Caso contrário cria se faltar.
  // eslint-disable-next-line no-console
  console.log(`bootstrap: garantindo database "${target}"…`);
  const sysPrisma = new PrismaClient({ datasources: { db: { url: superuserUrl } } });
  try {
    if (process.env.GESTLOG_FORCE_RESET === 'true') {
      // eslint-disable-next-line no-console
      console.log(`bootstrap: GESTLOG_FORCE_RESET=true → dropando "${target}"`);
      await sysPrisma.$executeRawUnsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${target}' AND pid <> pg_backend_pid();`,
      );
      await sysPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${target}"`);
    }
    const existing = await sysPrisma.$queryRawUnsafe<{ ok: number }[]>(
      `SELECT 1 AS ok FROM pg_database WHERE datname = '${target}'`,
    );
    if (existing.length === 0) {
      await sysPrisma.$executeRawUnsafe(`CREATE DATABASE "${target}"`);
      // eslint-disable-next-line no-console
      console.log(`bootstrap: database "${target}" criado`);
    }
  } finally {
    await sysPrisma.$disconnect();
  }

  // Fase 2: conecta no "gestlog" como superuser para criar roles.
  const prisma = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  try {
    await prisma.$executeRawUnsafe(
      `DO $$ BEGIN
         CREATE ROLE gestlog_app LOGIN PASSWORD '${appPwd}' NOBYPASSRLS;
       EXCEPTION WHEN duplicate_object THEN
         EXECUTE 'ALTER ROLE gestlog_app WITH LOGIN PASSWORD ''${appPwd}'' NOBYPASSRLS';
       END $$;`,
    );
    await prisma.$executeRawUnsafe(
      `DO $$ BEGIN
         CREATE ROLE gestlog_admin LOGIN PASSWORD '${adminPwd}' BYPASSRLS;
       EXCEPTION WHEN duplicate_object THEN
         EXECUTE 'ALTER ROLE gestlog_admin WITH LOGIN PASSWORD ''${adminPwd}'' BYPASSRLS';
       END $$;`,
    );
    await prisma.$executeRawUnsafe(
      `GRANT CONNECT ON DATABASE "${target}" TO gestlog_app, gestlog_admin;`,
    );
  } finally {
    await prisma.$disconnect();
  }

  // A partir daqui o prisma CLI aponta pra "gestlog".
  process.env.DATABASE_URL = adminUrl;

  // Fase 3: sincroniza schema do Prisma com o banco (sem migrations).
  // Isso evita problemas das migrations acumuladas em dev que foram
  // escritas quando o DB se chamava "gestlog" e as senhas eram literais.
  // eslint-disable-next-line no-console
  console.log('bootstrap: sincronizando schema (prisma db push)…');
  execSync(
    'pnpm --filter @gestlog/db exec prisma db push --accept-data-loss --skip-generate',
    { stdio: 'inherit', cwd: '/app', env: { ...process.env, DATABASE_URL: adminUrl } },
  );

  // Fase 4: aplica rls.sql — policies, GRANTs, helper function app_current_tenant().
  // prisma db execute tem bug com DO $$...$$; parseamos e rodamos statement
  // a statement via PrismaClient.$executeRawUnsafe.
  // eslint-disable-next-line no-console
  console.log('bootstrap: aplicando RLS (rls.sql)…');
  const rlsSql = readFileSync('/app/packages/db/prisma/rls.sql', 'utf-8');
  const statements = splitPostgresStatements(rlsSql);
  const rls = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  try {
    for (const stmt of statements) {
      await rls.$executeRawUnsafe(stmt);
    }
  } finally {
    await rls.$disconnect();
  }
  // eslint-disable-next-line no-console
  console.log(`bootstrap: RLS aplicada (${statements.length} statements).`);

  // Fase 5: garante senhas fortes nas roles (rls.sql pode ter rodado ALTER ROLE
  // sem senha; garante que DATABASE_APP_URL / ADMIN_URL autentiquem).
  const fix = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  try {
    await fix.$executeRawUnsafe(
      `ALTER ROLE gestlog_app WITH LOGIN PASSWORD '${appPwd}' NOBYPASSRLS;`,
    );
    await fix.$executeRawUnsafe(
      `ALTER ROLE gestlog_admin WITH LOGIN PASSWORD '${adminPwd}' BYPASSRLS;`,
    );
    // eslint-disable-next-line no-console
    console.log('bootstrap: tudo pronto. Iniciando NestJS.');
  } finally {
    await fix.$disconnect();
  }
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
