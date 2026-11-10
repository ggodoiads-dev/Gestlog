# Deploy — Vercel (web) + Railway (api + Postgres)

Topologia confirmada em [ADR-0004](./adr/0004-deploy-vercel-railway.md).

Este guia assume **staging/homologação**. Para produção com NF-e, OFX e LGPD de verdade, veja a seção "Antes de chamar de produção" no fim.

## Pré-requisitos

- Conta Vercel conectada ao GitHub (usuário `ggodoiads-dev`).
- Conta Railway conectada ao mesmo GitHub.
- Repositório `ggodoiads-dev/Gestlog` dando acesso para as duas plataformas.

## 1. Railway — Backend + Postgres + Redis

### 1.1 Criar o projeto

1. Railway → **New Project** → **Deploy from GitHub repo** → selecione `ggodoiads-dev/Gestlog`.
2. Na branch escolha **`claude/sweet-cray-mmitsi`** (ou faça merge para `main` primeiro).
3. Em **Root Directory** deixe em branco (o `railway.json` em `apps/api/` cuida da build).
4. Em **Watch Paths** adicione `apps/api/**`, `packages/**`.

### 1.2 Adicionar Postgres

1. No projeto Railway → **New** → **Database** → **PostgreSQL**.
2. Railway cria automaticamente a variável `DATABASE_URL` como referência.
3. Depois que o Postgres subir, abra uma shell e crie as duas roles RLS:

   ```sql
   -- Conectar via Railway SQL Editor (user postgres/root)
   CREATE ROLE gestlog_app LOGIN PASSWORD 'TROQUE_ESTA_SENHA' NOBYPASSRLS;
   CREATE ROLE gestlog_admin LOGIN PASSWORD 'TROQUE_ESTA_SENHA' BYPASSRLS;
   GRANT CONNECT ON DATABASE railway TO gestlog_app, gestlog_admin;
   ```

   As migrations criarão os GRANTs de schema automaticamente na primeira execução.

### 1.3 Adicionar Redis

1. **New** → **Database** → **Redis**. `REDIS_URL` vira referência automática.

### 1.4 Variáveis do serviço API

No serviço `gestlog` (o que veio do GitHub), aba **Variables**. Cole todas de uma vez:

```
NODE_ENV=production
TZ=America/Sao_Paulo

# Banco — use as references do Railway
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_APP_URL=postgresql://gestlog_app:SENHA_APP@${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}
DATABASE_ADMIN_URL=postgresql://gestlog_admin:SENHA_ADMIN@${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}
REDIS_URL=${{Redis.REDIS_URL}}

# Auth — GERE UM NOVO!
# openssl rand -hex 32
AUTH_SECRET=COLE_O_HEX_AQUI_64_CARACTERES

# CORS para o Vercel (ajuste depois com os domínios reais)
WEB_ORIGINS=https://gestlog.vercel.app,https://gestlog-*.vercel.app

# Seeds de demo só em staging
FEATURE_DEMO_SEEDS=true
```

> **Importante**: substitua `SENHA_APP` e `SENHA_ADMIN` pelos valores que você usou no passo 1.2. Railway faz interpolação de `${{Postgres.*}}` automaticamente, mas essas duas senhas não estão lá dentro — você as definiu manualmente.

### 1.5 Primeira deploy

Railway roda automaticamente quando detecta o push. Acompanhe em **Deployments**. O build vai:

1. `pnpm install`
2. Gerar Prisma Client
3. Buildar `apps/api`
4. No start: rodar `prisma migrate deploy` e subir o Nest

Na primeira vez o seed **não roda automaticamente**. Depois do primeiro deploy verde, abra uma shell do serviço:

```bash
pnpm --filter @gestlog/db seed
```

Isso cria 2 tenants demo (`demo_pct` e `demo_city_bus`) com usuários `admin.pct@demo.gestlog.local` e `admin.city@demo.gestlog.local`, senha `demo-password-only!`.

### 1.6 Domínio público

1. Aba **Settings** do serviço → **Networking** → **Generate Domain**.
2. Anote a URL (ex.: `gestlog-production.up.railway.app`). É o que a web vai usar.
3. Teste: `curl https://SUA_URL/health` deve devolver `{"status":"ok"}`.

## 2. Vercel — Frontend Next.js

### 2.1 Criar o projeto

1. Vercel → **Add New** → **Project** → import `ggodoiads-dev/Gestlog`.
2. Framework preset: **Next.js** (detecta automático).
3. Root Directory: deixe em branco.
4. Build Command: já vem do `vercel.json`.

### 2.2 Variáveis

Em **Environment Variables** antes de publicar:

```
API_BASE_URL=https://SUA_URL_DO_RAILWAY
AUTH_SECRET=MESMO_QUE_ESTA_NO_RAILWAY
NODE_ENV=production
```

> `AUTH_SECRET` precisa ser idêntico nos dois lados porque a web verifica o JWT que o backend emitiu.

### 2.3 Deploy

**Deploy**. Vercel builda e publica. Anote o domínio (ex.: `gestlog.vercel.app`).

### 2.4 Voltar no Railway e atualizar CORS

Depois que o Vercel der um domínio definitivo, volte no Railway → `WEB_ORIGINS` e inclua o domínio real + o padrão de preview:

```
WEB_ORIGINS=https://gestlog.vercel.app,https://gestlog-*-ggodoiads-dev.vercel.app
```

Salvar reinicia o serviço (cerca de 30s).

## 3. Testar end-to-end

1. Abra `https://gestlog.vercel.app` → tela de login.
2. Entre com `admin.pct@demo.gestlog.local` / `demo-password-only!`.
3. Dashboard deve mostrar o tenant **Primeira Classe Transportes — DEMO** com dados do seed.
4. Navegue por **Rotagrama**, **Veículos**, **Motoristas** — tudo deve carregar da API.
5. **Auditoria** deve aparecer vazia (nenhuma ação crítica feita ainda); gere uma fechando competência no **DRE**.

## 4. Preview per PR (opcional, altamente recomendado)

Na raiz do projeto Vercel → **Settings** → **Git** → marque **Automatic deployments for all branches**.

A partir daí, cada PR gera uma URL `https://gestlog-git-<branch>-ggodoiads-dev.vercel.app` que já bate no mesmo backend Railway (o `WEB_ORIGINS` com wildcard já cobre).

## 5. Observabilidade mínima

Essencial antes de deixar rodar sem olhar:

- Railway: **Logs** (ingest automático). Pino já serializa JSON.
- Vercel: **Logs** (90 dias no plano Pro, 1 dia no Hobby).
- Alerta de uptime externo (UptimeRobot free, 5 min): monitore `/health` do Railway e `/` do Vercel.

Não há OTEL exporter conectado ainda. É um TODO para quando migrar para produção real.

## Antes de chamar de "produção"

Tudo acima é **staging/homologação**. Para dados reais de cliente, NF-e e PIX de verdade:

1. Trocar `FEATURE_DEMO_SEEDS=false` e limpar os tenants demo.
2. Configurar backup automático do Postgres no Railway (daily).
3. Rodar restore drill (AT-39) e documentar RTO/RPO.
4. Conectar NF-e (parceiro: Focus NFe ou Nuvem Fiscal — ADR pendente).
5. Conectar OFX bancário (Starkbank, Banco do Brasil ou agregador — ADR pendente).
6. Revisão LGPD (DPA assinado com Vercel e Railway; registro de operação de tratamento).
7. Pen test / security review.
8. Rate limiting via `@nestjs/throttler` com Redis como store.
9. OTEL exporter para Grafana Cloud (free tier) ou Datadog.
10. SLA definido e contratado.

Enquanto nada disso estiver pronto, a instância é **DEMO**. Comunique isso claramente aos usuários (o pill "DEMO" no header da web já faz a sinalização).

## Troubleshooting

**Deploy falha com "Cannot find module '@prisma/client'".**
Verifique se `pnpm --filter @gestlog/db prisma:generate` roda antes do build da API. Já está no `railway.json`/`vercel.json`.

**API retorna 500 em toda rota.**
Olhe os logs do Railway. 90% das vezes é `AUTH_SECRET` faltando ou `DATABASE_APP_URL` com senha errada.

**CORS bloqueia a web.**
O domínio do Vercel precisa estar em `WEB_ORIGINS`. Padrão com wildcard: `https://gestlog-*.vercel.app`. Depois de mudar, aguarde o Railway reiniciar (30s).

**Migrations não aplicaram.**
No Railway, aba **Deployments** → último deploy → **View logs**. Procure por "Migration X applied" ou mensagens do Prisma.

**Seed não rodou.**
Ele é opt-in: `FEATURE_DEMO_SEEDS=true` + rodar manualmente a primeira vez (`pnpm --filter @gestlog/db seed`).
