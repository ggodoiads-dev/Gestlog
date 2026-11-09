# Architecture Decision Records — GESTLOG

ADRs são **imutáveis depois de publicados**. Uma decisão errada vira
um novo ADR que supersede o antigo (campo `Supersedes` / `Superseded by`).

## Índice

| # | Título | Status |
|---|--------|--------|
| 0001 | Stack principal (TypeScript + NestJS + Next.js + Postgres) | Accepted |
| 0002 | Monorepo com pnpm workspaces + Turborepo | Accepted |
| 0003 | Isolamento multi-tenant com RLS do Postgres como segunda camada | Accepted |

## Formato

Cada ADR segue o template:

```
# ADR-NNNN: Título
Status: Proposed | Accepted | Deprecated | Superseded by ADR-XXXX
Date: YYYY-MM-DD

## Contexto
## Decisão
## Alternativas consideradas
## Consequências
## Notas
```
