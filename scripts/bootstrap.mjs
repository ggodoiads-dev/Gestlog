#!/usr/bin/env node
/**
 * Bootstrap de desenvolvimento local do GESTLOG.
 *
 * 1. Copia .env.example para .env (se ainda não existir).
 * 2. Sobe os serviços de docker compose (postgres, redis, mailhog, minio).
 * 3. Espera o Postgres responder.
 * 4. Executa `prisma migrate deploy`.
 * 5. Roda seeds de demonstração (atrás de FEATURE_DEMO_SEEDS).
 */
import { execSync } from 'node:child_process';
import { existsSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function sh(cmd, opts = {}) {
  console.log(`\x1b[2m$ ${cmd}\x1b[0m`);
  execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
}

function section(title) {
  console.log(`\n\x1b[36m▸ ${title}\x1b[0m`);
}

section('Preparando .env');
const envPath = resolve(ROOT, '.env');
if (!existsSync(envPath)) {
  copyFileSync(resolve(ROOT, '.env.example'), envPath);
  console.log('.env criado a partir de .env.example');
} else {
  console.log('.env já existe — mantendo.');
}

section('Subindo infraestrutura local (docker compose)');
sh('docker compose up -d');

section('Aguardando Postgres aceitar conexões');
let tries = 0;
const maxTries = 30;
while (tries < maxTries) {
  try {
    execSync('docker compose exec -T postgres pg_isready -U gestlog -d gestlog', {
      stdio: 'ignore',
      cwd: ROOT,
    });
    break;
  } catch {
    tries += 1;
    if (tries === maxTries) {
      console.error('Postgres não respondeu a tempo.');
      process.exit(1);
    }
    execSync('sleep 2');
  }
}
console.log('Postgres pronto.');

section('Aplicando migrations do Prisma');
try {
  sh('pnpm --filter @gestlog/db prisma:migrate:deploy');
} catch {
  console.warn('Nenhuma migration aplicada ainda — pulando. Rode `pnpm db:migrate` quando houver migrations.');
}

section('Seeds de demonstração');
sh('pnpm --filter @gestlog/db seed');

console.log('\n\x1b[32m✓ Ambiente pronto.\x1b[0m');
console.log('   API:     pnpm --filter @gestlog/api dev');
console.log('   Web:     pnpm --filter @gestlog/web dev');
console.log('   Driver:  pnpm --filter @gestlog/driver dev');
console.log('   Mailhog: http://localhost:8025');
console.log('   MinIO:   http://localhost:9001 (gestlog / gestlog-dev-only)');
