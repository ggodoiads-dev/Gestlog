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
| Documentação-base (`docs/`) | `in-progress` | Arquivos neste commit |
| ADRs 0001/0002/0003 | `in-progress` | `docs/adr/` |
| Monorepo pnpm + Turbo | `not-started` | — |
| Docker Compose (Postgres, Redis, Mailhog) | `not-started` | — |
| Design system base (tokens + componentes mínimos) | `not-started` | — |
| CI (lint + typecheck + unit) | `not-started` | — |
| Observabilidade inicial (pino + healthchecks) | `not-started` | — |

## 2. Módulos (ver `MODULE_CATALOG.md`)

| # | Módulo | Estado | Nota |
|---|--------|--------|------|
| 01 | Core (tenant, users, roles, audit, documents) | `not-started` | Próximo alvo. |
| 02 | Clients / Portal | `not-started` | |
| 03 | CLM | `not-started` | |
| 04 | Smart Routing | `not-started` | **Alvo prioritário** (coluna vertebral). |
| 05 | Workforce | `not-started` | |
| 06 | Fleet | `not-started` | **Alvo prioritário**. |
| 07 | Maintenance | `not-started` | |
| 08 | Fuel | `not-started` | |
| 09 | AutoDispatch | `not-started` | |
| 10 | Operations | `not-started` | **Alvo prioritário**. |
| 11 | Driver App API | `not-started` | |
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
| AT-01 … AT-41 | `not-started` | — |

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
