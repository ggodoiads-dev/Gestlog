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
| App web Next.js | `in-progress` | `apps/web` — login (/login), dashboard (/), Rotagrama (/rotagrama + /rotagrama/:id) com AppShell + sidebar modular. Sessão via cookie HttpOnly; middleware protege rotas; Server Components consomem a API com Bearer. |
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
| 12 | Billing | `in-progress` | POST /v1/scheduled-trips/:id/validate gera medição conforme Contract.pricingMode (MONTHLY_FIXED/PER_TRIP); unique index parcial garante não-duplicação. GET /v1/billing/pre-invoices/:contractId?year=&month= agrega. |
| 13 | AR | `in-progress` | Emissão de Receivable + POST /v1/receivables/:id/receipts com Idempotency-Key obrigatório. Alocação 1:1, parcial e total; overpayment → 409; status OPEN → PARTIALLY_PAID → PAID derivado; N:M (rateio entre títulos) e conciliação OFX virão em fatia seguinte. |
| 24 | Governance / Approvals | `in-progress` | POST /v1/approvals + /decisions com SoD obrigatória (sem autoaprovação), sem aprovação tácita, decisão idempotente por aprovador. REJECT fecha pedido imediatamente; APPROVE só fecha ao atingir `requiredApprovals`. Delegation modelada; endpoints de delegação virão com plantão/alçada. |
| 14 | Procurement | `in-progress` | POST /v1/purchase-orders + /receipts com overreceive bloqueado; vínculo opcional a ApprovalRequest (APPROVED). Status OPEN → PARTIALLY_RECEIVED → RECEIVED. |
| 15 | AP | `in-progress` | POST /v1/payables (3-way grosseiro: fatura ≤ recebido) + /payments com Idempotency-Key. **externalStatus=UNKNOWN NÃO atualiza saldo** (§27 prompt); replay dedupe; overpayment → 409. |
| 18 | Finance (DRE/EBITDA) | `in-progress` | GET /v1/finance/dre com modo `live` ou `snapshot`. POST /v1/finance/periods/.../close cria `EBITDASnapshot` imutável e bloqueia novas medições naquela competência (via guard no BillingService). POST .../reopen com motivo preserva snapshot antigo; nova versão é criada no próximo close. Opex ainda consolidado por tenant (separação por LegalEntity vem com GL completo). |
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
| AT-02 (usuário sem autoridade não aprova) | `homologated` | `apps/api/test/governance-approvals.e2e.spec.ts` — viewer recebe 403 mesmo via HTTP direto |
| AT-03 (solicitante não aprova o próprio objeto) | `homologated` | `apps/api/test/governance-approvals.e2e.spec.ts` — requestedBy === approverId → 403 |
| AT-04 (jornada do motorista: 10h/dia, 44h/semana) | `homologated` | `apps/api/test/compliance-journey.e2e.spec.ts` — ComplianceService.checkJourneyInTx bloqueia antes do insert, retorna código estruturado por violação |
| AT-05 (descanso interjornada: ≥ 11h entre jornadas de dias distintos) | `homologated` | `apps/api/test/compliance-journey.e2e.spec.ts` — gap de 4h bloqueia com `INTERJOURNEY_REST`, gap de 12h passa; jornada = envelope das trips do dia-UTC (viagens do mesmo dia são UMA jornada) |
| AT-06 (exclusividade de veículo em slot temporal) | `homologated` | `apps/api/test/compliance-journey.e2e.spec.ts` — overlap de 1h bloqueia com `VEHICLE_SLOT_CONFLICT` nomeando o assignment conflitante; outro veículo no mesmo slot passa; adjacência sem overlap passa |
| AT-28 (audit append-only garantido no banco) | `homologated` | `apps/api/test/audit-append-only.e2e.spec.ts` — `gestlog_app` tem apenas GRANT SELECT+INSERT em `audit.audit_events`; UPDATE/DELETE retorna `permission denied`. Finance.close/reopen, AutoDispatch.propose/cancel, Governance.decide e AP.pay gravam eventos dentro da mesma tx do fato |
| AT-18 (OFX e API trazem o mesmo movimento sem duplicar) | `homologated` | `apps/api/test/treasury.e2e.spec.ts` — unique (tenant, bankAccount, externalId); 2ª importação com mesmos externalIds devolve inserted=0, duplicates=N; state/matched_* preservados |
| AT-13 (compra ≠ consumo de combustível) | `homologated` | `apps/api/test/fuel.e2e.spec.ts` — compra credita o tanque, abastecimento debita; extrato lista cada tipo; abastecer além do saldo bloqueia |
| AT-14 (compra emergencial de combustível sem aprovação prévia) | `homologated` | `apps/api/test/fuel.e2e.spec.ts` — acima do limite sem `emergency=true` é 403; emergencial nasce PENDING_APPROVAL e não entra no saldo até aprovação por outro usuário (SoD) |
| AT-15 (transferência entre tanques não é compra) | `homologated` | `apps/api/test/fuel.e2e.spec.ts` — endpoint próprio; volume total preservado; mesmo tanque como origem e destino é 400; além do saldo é 409 |
| AT-29 (EBITDA não inclui juros/depreciação/IR) | `homologated` | `apps/api/test/assets.e2e.spec.ts` — payables classificados; opex do DRE ignora CAPEX, FINANCIAL_INTEREST, FINANCIAL_PRINCIPAL e TAX_INCOME |
| AT-30 (ativo financiado proposto para venda consulta credor) | `homologated` | `apps/api/test/assets.e2e.spec.ts` — dispose sem creditorConsent → 403 com código `CREDITOR_CONSENT_REQUIRED`; com consent passa; sem financiamento ativo dispensa consent |
| AT-31 (revisão de vida útil altera só depreciação futura) | `homologated` | `apps/api/test/assets.e2e.spec.ts` — competência anterior a `effectiveFrom` usa vida antiga; competência posterior usa vida nova; `usefulLifeMonthsAtCalc` guardado em cada entry |
| AT-32 (CAPEX capitalizado não é lançado como OPEX) | `homologated` | `apps/api/test/assets.e2e.spec.ts` — payable classificado como `CAPEX` fica fora do somatório de opex; `capitalized_asset_id` opcional liga ao FixedAsset |
| AT-04 oficial (alterar preço/beneficiário após pedido invalida a aprovação) | `homologated` | `apps/api/test/governance-material-change.e2e.spec.ts` — ApprovalsService.decide compara hash canônico do snapshotJson vs estado atual do subject (payable_invoice e receivable); divergência bloqueia APPROVE com código `MATERIAL_CHANGED`; REJECT e RETURN seguem |
| AT-05 oficial (SLA de plantão nunca aprova por silêncio) | `homologated` | `apps/api/test/governance-sla-fractionation.e2e.spec.ts` — `slaMinutes` por pedido; APPROVE após prazo retorna 409 `EXPIRED` + marca estado como EXPIRED (tx isolada); REJECT ainda passa; endpoint batch `POST /v1/approvals/expire-stale` |
| AT-06 oficial (fracionamento para burlar alçada é detectado) | `homologated` | `apps/api/test/governance-sla-fractionation.e2e.spec.ts` — ao criar pedido, soma de pedidos do mesmo requester+supplier nos últimos 7 dias; soma + atual > threshold bloqueia com 409 `FRACTIONATION_DETECTED` listando peerRequestIds |
| AT-08 (designação atômica concorrente) | `homologated` | `apps/api/test/autodispatch-concurrency.e2e.spec.ts` — unique index parcial no banco |
| AT-11 (evento offline enviado duas vezes → 1 fato) | `homologated` | `apps/api/test/driver-events.e2e.spec.ts` — corrida de 5 submissões concorrentes resulta em id único |
| AT-16 (pedido parcial recebido/faturado/pago não duplica) | `homologated` | `apps/api/test/procurement-ap.e2e.spec.ts` — 12 testes cobrindo overreceive, 3-way grosseiro, overpayment, UNKNOWN sem efeito, replay |
| AT-17 (status bancário desconhecido não gera retry cego) | `homologated` | mesmo arquivo — UNKNOWN registra fato mas mantém saldo intacto |
| AT-26 (competência fechada bloqueia mutação silenciosa) | `homologated` | `apps/api/test/finance-close.e2e.spec.ts` — guard no BillingService + snapshot imutável + reopen com motivo preservando v1 |
| AT-17 (contrato reajustado preserva histórico) | `in-progress` | versionamento imutável de rotas implementado — AT-17 propriamente dito aguarda `ContractAdjustment` |
| AT-20 (contrato mensal fixo não gera medição duplicada) | `homologated` | `apps/api/test/billing-measurement.e2e.spec.ts` — unique index parcial por (contract, competência) |
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
