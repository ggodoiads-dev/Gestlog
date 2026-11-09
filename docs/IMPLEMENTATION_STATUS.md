# Status da Implementação — GESTLOG

> **Fonte única da verdade** sobre o que está pronto, parcial,
> bloqueado ou não iniciado. Nenhum outro documento afirma "pronto" —
> todos apontam para cá.

**Última revisão:** 2026-11-09 (sessão inicial, dia 0 do repositório).

## Convenção

| Estado | Significado |
|--------|-------------|
| `not-started` | Nenhum código. |
| `scaffolded` | Módulo registrado, modelos iniciais, sem regras. |
| `in-progress` | Pelo menos um caso de uso E2E navegável, não pronto. |
| `implemented` | Regras principais cobertas por testes. |
| `homologated` | Passou pelos casos em `ACCEPTANCE_TESTS.md`. |
| `blocked` | Depende de decisão externa (ver `DECISIONS_AND_OPEN_QUESTIONS.md`). |

## 1. Fundação

| Item | Estado | Evidência |
|------|--------|-----------|
| Documentação-base (`docs/`) | `scaffolded` | 11 docs + 3 ADRs |
| ADRs 0001/0002/0003 | `scaffolded` | `docs/adr/0001-0003` |
| Monorepo pnpm + Turbo | `scaffolded` | `package.json`, `pnpm-workspace.yaml`, `turbo.json` |
| Docker Compose (Postgres, Redis, Mailhog, MinIO) | `scaffolded` | `docker-compose.yml`, `scripts/bootstrap.mjs` |
| Schema Prisma inicial | `implemented` | 3 migrations aplicadas; FORCE RLS em todas as tabelas tenant-scoped |
| RLS policies | `homologated` | `apps/api/test/tenant-isolation.e2e.spec.ts` — 6 testes verdes, incluindo tentativa cross-tenant via URL |
| Backend NestJS | `in-progress` | `apps/api` — `/health*`, `/v1/auth/login`, `/v1/me`, `/v1/users`, `/v1/clients`, `/v1/clients/:id`. Guards JwtAuth + Permissions. TenantContextMiddleware propaga `TenantContext` via req + ALS. |
| Design system base | `scaffolded` | `packages/ui` — tokens.css + Button + Badge + DemoBanner + preset Tailwind |
| App web Next.js | `scaffolded` | `apps/web` — landing dia 0 com DemoBanner |
| Driver PWA Next.js | `scaffolded` | `apps/driver` — landing dia 0 |
| `packages/shared` (Money, Zod, Tenant) | `implemented` | `packages/shared/src/*`; `money.spec.ts` cobre precisão, moeda, centavos, pt-BR, arredondamento, formatação |
| `packages/domain` placeholder | `not-started` | aguardando primeiro caso de uso |
| CI (lint + typecheck + unit + build) | `scaffolded` | `.github/workflows/ci.yml` |
| Observabilidade inicial (pino + healthchecks) | `scaffolded` | nestjs-pino + redact de campos sensíveis |

## 2. Módulos (ver `MODULE_CATALOG.md`)

| # | Módulo | Estado | Nota |
|---|--------|--------|------|
| 01 | Core (tenant, users, roles, audit, documents) | `in-progress` | Auth + Tenant Context + RBAC + /v1/me + /v1/users. Audit events e documents ainda não implementados. |
| 02 | Clients / Portal | `in-progress` | /v1/clients (list + detail) com RLS validado. Portal UI ainda não. |
| 03 | CLM | `scaffolded` | Contratos seedados por tenant (CTR-*-001). Endpoints virão com reajuste/assinatura. |
| 04 | Smart Routing | `in-progress` | /v1/routes (list/create/detail) + /v1/routes/:id/versions (create/publish). Versão publicada é imutável. |
| 05 | Workforce | `in-progress` | /v1/drivers (list/create) com DriverLicense + checkEligibilityInTx (status + categoria + validade). |
| 06 | Fleet | `in-progress` | /v1/vehicles (list/create) com VehicleEligibilityProjection recomputada por operationalStatus (base para expansão com docs/OS). |
| 07 | Maintenance | `not-started` | |
| 08 | Fuel | `not-started` | |
| 09 | AutoDispatch | `in-progress` | POST /v1/scheduled-trips/:id/assignments + DELETE /v1/assignments/:id. Atomicidade via unique index parcial (state != CANCELLED/SUPERSEDED). Valida elegibilidade de veículo e motorista. |
| 10 | Operations | `in-progress` | /v1/routes/:id/expand + /v1/scheduled-trips?date. Expansão idempotente; versão imutável: publicação de nova versão não reescreve trips antigas. |
| 11 | Driver App API | `in-progress` | POST /v1/scheduled-trips/:id/events com Idempotency-Key obrigatório. Dedupe atômico (unique index tenantId+key); TripExecution lazy; estado agregado só avança. |
| 12 | Billing | `not-started` | |
| 13 | AR | `not-started` | |
| 14 | Procurement | `not-started` | |
| 15 | AP | `not-started` | |
| 16 | Treasury | `not-started` | |
| 17 | Budget & Performance | `not-started` | |
| 18 | Finance (DRE/EBITDA) | `not-started` | |
| 19 | Assets | `not-started` | |
| 20 | CAPEX | `not-started` | |
| 21 | Debt | `not-started` | |
| 22 | Working Capital | `not-started` | |
| 23 | Financial Risk | `not-started` | |
| 24 | Governance / Approvals | `not-started` | |
| 25 | Intelligence | `not-started` | |
| 26 | Client Portal (UI) | `not-started` | |
| 27 | Admin & Settings | `not-started` | |

## 3. Casos de aceite (ver `ACCEPTANCE_TESTS.md`)

Todos em `not-started`. A tabela abaixo é preenchida à medida que cada
caso ganha teste automatizado.

| AT | Estado | Teste |
|----|--------|-------|
| AT-01 (tenants não vazam entre si) | `homologated` | `apps/api/test/tenant-isolation.e2e.spec.ts` |
| AT-02 (usuário sem autoridade não aprova) | `in-progress` | guard RBAC implementado; aprovações viram no módulo Governance |
| AT-08 (designação atômica concorrente) | `homologated` | `apps/api/test/autodispatch-concurrency.e2e.spec.ts` — unique index parcial no banco |
| AT-11 (evento offline enviado duas vezes → 1 fato) | `homologated` | `apps/api/test/driver-events.e2e.spec.ts` — corrida de 5 submissões concorrentes resulta em id único |
| AT-17 (contrato reajustado preserva histórico) | `in-progress` | versionamento imutável de rotas implementado — AT-17 propriamente dito aguarda `ContractAdjustment` |
| AT-35 (rotagrama recorrente estável sem lista diária) | `in-progress` | expansão idempotente validada; publicação de nova versão não reescreve trips passadas — `apps/api/test/routing-versioning.e2e.spec.ts` |
| AT-03 … AT-41 (demais) | `not-started` | — |

## 4. Integrações (ver `INTEGRATION_CONTRACTS.md`)

Todas em `PENDENTE`. Nenhuma credencial neste repositório. Nenhum
módulo que dependa de integração está marcado como `homologated`.

## 5. Dívida técnica conhecida

Vazia (dia 0). Cada dívida futura entra como item com responsável,
risco e alvo.

## 6. Como atualizar este documento

1. Toda mudança de estado é feita no mesmo PR que entrega o código.
2. Mudança para `homologated` exige apontar o teste (`arquivo:nome`).
3. Mudança para `blocked` exige apontar o item em
   `DECISIONS_AND_OPEN_QUESTIONS.md`.
4. Nenhum PR pode marcar algo como `homologated` apenas em texto; o
   teste precisa rodar no CI.
