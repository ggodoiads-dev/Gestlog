# Deploy e Operações — GESTLOG

> Estado atual: **somente ambiente de desenvolvimento local está
> definido**. Topologia de produção fica como ADR futuro (ADR-0004+).

## 1. Ambientes

| Ambiente | Propósito | Status |
|----------|-----------|--------|
| `local` | Desenvolvimento (Docker Compose). | **Em construção** |
| `ci` | GitHub Actions (lint, typecheck, migrations dry-run, testes, build). | **Em construção** |
| `preview` | Deploy efêmero por PR, dados sintéticos. | Planejado |
| `staging` | Homologação pré-produção, dados fictícios ou cópia anonimizada. | Planejado |
| `production` | Operação real. | **Não existe ainda — nenhum dado real.** |

## 2. Setup local (resumo)

```bash
# Pré-requisitos: Node 22, pnpm 10, Docker, git.
pnpm install
pnpm run bootstrap           # sobe Postgres, Redis, Mailhog, roda migrations e seeds demo
pnpm --filter @gestlog/api dev
pnpm --filter @gestlog/web dev
pnpm --filter @gestlog/driver dev
```

Os seeds **somente de demonstração** criam tenants `demo_pct` (Primeira
Classe — demo) e `demo_city_bus` (Transportadora Fictícia) com usuários
de cada perfil. Todo registro gerado por seed carrega
`metadata.__demo__ = true` e banner na UI.

## 3. Variáveis de ambiente

Arquivo `.env.example` na raiz lista todas. Nenhum valor real vive no
repositório. Exemplos (não-sensíveis):

```
NODE_ENV=development
APP_BASE_URL=http://localhost:3000
API_BASE_URL=http://localhost:4000
DATABASE_URL=postgres://gestlog:gestlog@localhost:5432/gestlog
REDIS_URL=redis://localhost:6379
LOG_LEVEL=info
TZ=America/Sao_Paulo
```

Secrets reais em produção vêm de um KMS/Secret Manager (ADR futuro).

## 4. Observabilidade

- **Logs**: pino JSON, com `requestId`, `tenantId`, `userId` (quando
  aplicável), `correlationId`. Fields sensíveis em `redact`.
- **Métricas**: OpenTelemetry → Prometheus-compatível (configurável).
- **Traços**: OTel SDK no NestJS e workers.
- **Healthchecks**:
  - `/health` liveness
  - `/health/ready` readiness (DB, Redis, filas, migrations)
  - `/health/integrations` por integração externa
- **Alertas sugeridos** (configurar em produção):
  - Falha de login em massa (>N em X min).
  - Erros de RLS detectados (crítico).
  - Fila com dead-letter crescente.
  - Latência de endpoint crítico (login, aprovação, dispatch) acima do
    objetivo.
  - Status "desconhecido" em integração sem resolução em T.
  - Divergência entre fatos gerenciais e DRE pós-fechamento.

## 5. Backups e recuperação

Diretivas iniciais (RTO/RPO são objetivos operacionais, **não SLA
contratual** até homologação):

| Dado | Objetivo RTO (horas) | Objetivo RPO (minutos) |
|------|----------------------|------------------------|
| Viagem em andamento | 1 | 5 |
| Financeiro | 4 | 15 |
| Relatórios/BI | 24 | 60 |

- Backups full diários + WAL contínuo do Postgres.
- Restauração testada mensalmente em `staging`.
- Reconciliação financeira pós-restore é obrigatória e documentada.

## 6. Deploy

**Topologia aprovada (ADR-0004):**

- **Backend (`apps/api`)** → Railway + Postgres + Redis gerenciados.
- **Frontend (`apps/web`, `apps/driver`)** → Vercel.

### Railway (API)

- `main.ts` lê `PORT` (convenção Railway) com fallback para `API_PORT` em dev.
- Variáveis obrigatórias: `DATABASE_URL`, `DATABASE_APP_URL`,
  `DATABASE_ADMIN_URL`, `REDIS_URL`, `AUTH_SECRET`, `WEB_ORIGINS`.
- Pre-deploy hook: `pnpm --filter @gestlog/db prisma:migrate:deploy`.
- Healthcheck: `/health/ready`.
- CORS: restrito aos domínios de `WEB_ORIGINS`; wildcard para previews
  da Vercel (`https://gestlog-*.vercel.app`).

### Vercel (Web)

- Diretório raiz do projeto: `apps/web`.
- Build command: `cd ../.. && pnpm install --frozen-lockfile=false &&
  pnpm --filter @gestlog/shared build && pnpm --filter @gestlog/web build`.
- Variáveis: `API_BASE_URL` (Railway), `APP_BASE_URL` (próprio domínio).
- Preview por PR; produção promovida manualmente até fecharmos o
  pipeline de release.

### Processo

- Pipeline (GitHub Actions) com estágios: lint → typecheck → unit →
  integration → migration dry-run → build → deploy Railway (API) +
  Vercel (web). Deploy em produção exige aprovação manual.
- Migrations via Prisma `migrate deploy`. Nenhuma migration altera
  dados em produção sem backup/snapshot explícito.
- Rollback: Railway serve a versão anterior; Vercel promove outra
  deployment. Migrations seguem **expansão → contração** (fases
  expand → migrate app → contract).
- `FEATURE_DEMO_SEEDS=true` **proibido** em produção. CI valida.

## 7. Runbooks (placeholders)

Cada runbook terá seu arquivo em `docs/runbooks/`:

- `runbooks/incident-response.md` — classificação, SLAs, comunicação.
- `runbooks/bank-integration-degraded.md`
- `runbooks/fiscal-integration-degraded.md`
- `runbooks/gps-degraded.md`
- `runbooks/postgres-degraded.md`
- `runbooks/redis-degraded.md`
- `runbooks/period-reopen.md`

## 8. Segurança operacional

- Acesso de suporte cross-tenant: função Postgres separada,
  autorização temporária, trilha de auditoria, revisão semanal.
- Gestão de chaves com rotação automatizada.
- Testes de penetração periódicos (quando aplicável comercialmente).
- Processo de resposta a incidente LGPD alinhado ao DPO do tenant.
