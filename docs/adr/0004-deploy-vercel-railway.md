# ADR-0004: Deploy — Vercel (frontend) + Railway (backend)

Status: Accepted
Date: 2026-11-09

## Contexto

O GESTLOG precisa de um alvo de deploy estável para homologação e
produção. Decisão do product owner:

- **Frontend (`apps/web`, `apps/driver`)** → **Vercel**.
- **Backend (`apps/api`)** → **Railway** (com Postgres + Redis
  gerenciados).

## Decisão

Adotamos essa topologia como padrão. Os ajustes de código e
configuração seguem abaixo.

### Backend em Railway

- `apps/api` lê `PORT` (convenção Railway) como porta de escuta;
  `API_PORT` continua funcionando como fallback para dev.
- Variáveis obrigatórias (gerenciadas por Railway):
  - `DATABASE_URL` (Postgres do plugin)
  - `DATABASE_APP_URL` (role `gestlog_app`, NOBYPASSRLS)
  - `DATABASE_ADMIN_URL` (role `gestlog_admin`, BYPASSRLS, uso
    auditado — login e seeds)
  - `REDIS_URL` (plugin de Redis quando necessário)
  - `AUTH_SECRET` (gerado uma vez; mantido no Vault do Railway)
  - `WEB_ORIGINS` (lista separada por vírgula com os domínios que
    podem bater na API: `https://gestlog.vercel.app`,
    `https://gestlog-preview-*.vercel.app`, etc.)
- CORS limitado a `WEB_ORIGINS`; credentials liberados para o cookie
  de sessão da versão web quando passarmos a usá-la direto da UI
  (por ora a web usa Bearer server-side).
- Build + deploy: `pnpm --filter @gestlog/db prisma:generate &&
  pnpm --filter @gestlog/api build` com start em
  `node apps/api/dist/main.js`.
- Migrations: `pnpm --filter @gestlog/db prisma:migrate:deploy`
  executado automaticamente no pre-deploy (Railway `preDeploy` hook).
- Healthcheck do Railway aponta para `/health/ready`.

### Frontend em Vercel

- Monorepo detectado via `pnpm-workspace.yaml`; o diretório raiz do
  projeto Vercel é `apps/web`.
- Build command: `cd ../.. && pnpm install --frozen-lockfile=false &&
  pnpm --filter @gestlog/shared build && pnpm --filter @gestlog/web
  build`.
- Output directory: `.next`.
- Variáveis de ambiente obrigatórias:
  - `API_BASE_URL` → URL pública da API em Railway (ex.:
    `https://api.gestlog.com`).
  - `APP_BASE_URL` → o próprio domínio da web (`https://gestlog.com`)
    para redirecionamentos.
- Preview deployments: cada PR gera um preview; a API usa
  `WEB_ORIGINS` com wildcard por projeto Vercel (vercel.app) para
  aceitar.
- Driver app (`apps/driver`) irá para outro projeto Vercel com rota
  própria quando chegar a fatia PWA.

### DNS e domínio

- Produção: `gestlog.com` (web) e `api.gestlog.com` (API). O
  provisionamento acontece quando o product owner validar o nome
  oficial — por ora os domínios gerados por Vercel/Railway
  funcionam.

## Alternativas consideradas

| Alternativa | Por que não |
|-------------|-------------|
| Monolito em container no Fly.io | Menos integrado ao fluxo PR→preview do Next.js. |
| Render + Neon | Viável; Railway já foi escolhido pelo PO. |
| AWS (ECS + RDS + CloudFront) | Custo operacional mais alto; sem ganho para o estágio atual. |

## Consequências

- CORS e URLs públicas viram primeira classe (ver `apps/api/src/main.ts`).
- O `apps/api` não pode assumir filesystem local persistente (Railway
  é efêmero). Upload de documentos vai para S3-compatível (ADR
  futuro).
- Seeds reais (`FEATURE_DEMO_SEEDS`) ficam proibidos em produção por
  convenção; o pre-deploy do Railway nunca seta essa flag.
- Segredos de produção (chaves fiscais, bancárias) vivem em Railway
  Variables (ou plugin de Vault). Nunca no repo.

## Notas

Quando passarmos a servir cookies entre domínios (web em
`gestlog.com`, API em `api.gestlog.com`), revisar a política de cookies
HttpOnly + `SameSite=None; Secure` com atenção especial à proteção
CSRF — por ora a web atua como "BFF" para a API (chama server-side
com Bearer).
