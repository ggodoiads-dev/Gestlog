# @gestlog/db

Prisma schema + migrations + RLS policies do GESTLOG.

## Estrutura

- `prisma/schema.prisma` — schema modular (schemas Postgres por bounded context).
- `prisma/rls.sql` — Row-Level Security (ADR-0003). Aplicado via migration.
- `prisma/seed.ts` — seeds **somente** demo, atrás da flag `FEATURE_DEMO_SEEDS`.
- `src/client.ts` — único ponto de criação do `PrismaClient`.
- `src/rls.ts` — `withTenantScope` (obrigatório) e `withPlatformScope` (auditado).

## Regras não negociáveis

1. Toda tabela tenant-scoped carrega `tenantId` + policy RLS no mesmo
   commit da migration que cria a tabela.
2. `gestlog_app` **não** tem `BYPASSRLS`. Testes de isolamento rodam
   com essa role.
3. `withTenantScope` é a única porta para queries de domínio.
4. Seeds reais nunca aqui — este pacote serve só demo + bootstrap de
   catálogos globais imutáveis.
