# Arquitetura — GESTLOG

> Status: **em construção**. A implementação acompanha este documento por
> fatias verticais; a matriz de progresso vive em
> [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md).

## 1. Princípios

1. **Monólito modular.** Um único processo de aplicação organizado por
   *bounded contexts* bem definidos. Microserviços só quando o contexto, a
   carga ou o acoplamento provarem que é necessário.
2. **Fonte única da verdade.** Cada fato de negócio (medição contratual,
   elegibilidade de veículo, designação operacional, fato financeiro
   gerencial) pertence a **um** domínio. Visões, projeções e caches em
   outros módulos são sempre derivadas e marcadas como tais.
3. **Multi-tenant por construção.** Isolamento verificado em três camadas:
   escopo na aplicação, *Row-Level Security* no Postgres, e testes
   automatizados que tentam vazar dados entre tenants.
4. **Dinheiro é `Decimal`.** Nunca `float`. Arredondamento é decisão
   explícita por contexto (fiscal, gerencial, exibição).
5. **Idempotência de ponta a ponta.** Todo evento que entra pelo app do
   motorista, por webhook bancário, importação OFX/CSV ou integração fiscal
   carrega uma chave idempotente e um estado "desconhecido" tratado por
   consulta antes de retry.
6. **Trilha de auditoria append-only.** Decisões, mudanças de estado e
   acessos sensíveis geram eventos imutáveis com autor, motivo, versão e
   correlação.
7. **Honestidade de estado.** O sistema distingue *planejado*, *executado*,
   *validado*, *faturável*, *faturado*, *recebido*, *conciliado* e
   *contabilizado*; disponibilidade operacional ≠ propriedade patrimonial ≠
   custódia ≠ posição GPS ≠ situação contábil.

## 2. Stack (ADR-0001, ADR-0002, ADR-0003)

| Camada | Escolha | Por quê |
|--------|---------|---------|
| Linguagem | TypeScript (strict) | Tipagem forte compartilhada entre API, front, PWA do motorista e workers. Ecossistema maduro para o escopo brasileiro. |
| Backend | NestJS 10 | Fronteira de módulo explícita (módulos + DI + guards + interceptors), ideal para monólito modular; OpenAPI de primeira classe. |
| Banco | PostgreSQL 16 | Transacional sério, `numeric`/`decimal` nativos, Row-Level Security, JSONB, índices parciais, extensões (`pg_trgm`, `postgis` quando necessário). |
| ORM | Prisma 5 | DX e segurança de tipos; `interactive transactions` para invariantes atômicas; migrations rastreáveis. SQL bruto permitido para RLS e consultas analíticas. |
| Fila / eventos | BullMQ + Redis 7 + Outbox em Postgres | Entrega confiável, retries exponenciais, dead-letter, *at-least-once* com dedupe por chave idempotente. |
| Auth | Auth.js (sessão) + JWT curto para API móvel | MFA TOTP, SSO futuro, revogação central. |
| Front administrativo | Next.js 15 (App Router) + React 19 | SSR/RSC, roteamento maduro, co-locação de UI e server actions quando conveniente. |
| PWA do motorista | Next.js 15 (app separado) + service worker + IndexedDB | Offline resiliente, fila idempotente, instalável; mesma stack TS. |
| UI | Tailwind 4 + componentes próprios (base `shadcn/ui` fortemente customizada) + TanStack Table/Query + React Hook Form + Zod | Densidade informacional sem perder elegância; tipagem ponta a ponta. |
| Mapas | MapLibre GL JS + tiles OpenStreetMap (default) | Open-source, substituível por Mapbox/Google via adaptador quando necessário. |
| Dinheiro | `decimal.js` encapsulado em `Money` (packages/shared) | Proíbe aritmética com `number` por tipagem. |
| Validação | Zod em contratos compartilhados | Mesmo schema no cliente, servidor e workers. |
| Logs | pino (JSON estruturado) | Baixo overhead, redaction de campos sensíveis. |
| Observabilidade | OpenTelemetry (hooks desde o dia 1) | Traços/métricas; exportador configurável. |
| Testes | Vitest (unit/integration) + Playwright (E2E) + Supertest (API) | Rápido, paralelo, bem integrado ao monorepo. |
| Monorepo | pnpm workspaces + Turborepo | Cache de build, tasks paralelas, consistência de versões. |
| Dev local | Docker Compose (Postgres, Redis, Mailhog) + script `bootstrap` | Zero-config para novos ambientes. |
| CI | GitHub Actions | lint + typecheck + unit + migration dry-run + build. |

As justificativas completas estão nos ADRs em [`adr/`](./adr/).

## 3. Layout do monorepo

```
gestlog/
├── apps/
│   ├── api/        NestJS: controllers, módulos de aplicação, workers.
│   ├── web/        Next.js: administração, operação, finanças, cliente.
│   └── driver/     Next.js PWA: app do motorista (offline-first).
├── packages/
│   ├── db/         Prisma schema, migrations, RLS policies, seeds.
│   ├── domain/     Núcleo de domínio por bounded context (puro TS).
│   ├── shared/     Tipos, Zod schemas, value objects (Money, Tenant, etc).
│   ├── ui/         Design system reutilizável (tokens + componentes).
│   └── config/     ESLint, TS, Tailwind, Prettier compartilhados.
├── docs/           Documentação viva e ADRs.
├── scripts/        Bootstrap, migrations, exports, utilitários.
└── docker-compose.yml
```

## 4. Bounded contexts (módulos)

A regra de ouro: **cada contexto é dono dos seus fatos e expõe apenas APIs
estáveis e eventos de domínio**. Outros contextos lêem via porta/adapter,
nunca acessam tabelas alheias.

| Contexto | Responsabilidade | Fatos canônicos |
|----------|------------------|-----------------|
| **Core** | Tenant, pessoas jurídicas, garagens, usuários, perfis, permissões, auditoria, documentos. | `Tenant`, `LegalEntity`, `Garage`, `User`, `Role`, `Permission`, `AuditEvent`, `Document`. |
| **Clients** | Clientes corporativos, unidades/plantas, contatos, acessos ao portal. | `Client`, `ClientUnit`, `ClientContact`. |
| **CLM** | Contratos, versões, preços, reajustes, SLAs, aditivos. | `Contract`, `ContractVersion`, `PricingModel`, `SLAClause`. |
| **Smart Routing** | Rotas, versões, pontos, turnos, janelas, restrições. | `Route`, `RouteVersion`, `Stop`, `Turn`. |
| **Workforce** | Motoristas, vínculos, habilitações, escalas, disponibilidade. | `Driver`, `DriverLicense`, `Schedule`, `Availability`. |
| **Fleet** | Veículos, documentos, custódia, elegibilidade consolidada. | `Vehicle`, `VehicleDocument`, `Custody`, `EligibilityProjection`. |
| **Maintenance** | Avarias, OS, liberação técnica, checklists. | `Defect`, `ServiceOrder`, `TechnicalRelease`, `ChecklistSubmission`. |
| **Fuel** | Tanques internos, abastecimentos, estoque, consumo. | `Tank`, `Fueling`, `FuelMovement`. |
| **AutoDispatch** | Designação oficial (motorista + veículo + viagem). | `Assignment`. |
| **Operations** | Viagens programadas, execuções, eventos do motorista. | `ScheduledTrip`, `TripExecution`, `OperationalEvent`. |
| **Billing** | Livro de medição, pré-fatura, documento fiscal. | `BillingMeasurement`, `FiscalDocument`. |
| **AR** | Contas a receber, recebimentos, cobrança. | `Receivable`, `Receipt`, `CollectionAction`. |
| **Procurement** | Requisições, cotações, pedidos, recebimentos. | `PurchaseRequest`, `PurchaseOrder`, `GoodsReceipt`. |
| **AP** | Contas a pagar, pagamentos. | `Payable`, `Payment`. |
| **Treasury** | Contas bancárias, movimentos, conciliação. | `BankAccount`, `BankTransaction`, `Reconciliation`. |
| **Budget** | Orçamento baseline, revisado, forecast, compromissos. | `BudgetVersion`, `BudgetLine`, `Commitment`, `Hold`. |
| **Finance** | Fatos gerenciais, DRE, EBITDA, fechamento. | `GeneralLedgerEntry`, `AccountingPeriod`, `EBITDASnapshot`. |
| **Assets** | Patrimônio, depreciação, inventário, alienação. | `Asset`, `DepreciationSchedule`, `InventoryCount`. |
| **CAPEX** | Projetos de investimento, análise, aprovação, captura. | `CapexProject`, `CapexCase`, `BenefitRealization`. |
| **Governance** | Aprovações, delegações, plantão, SoD, riscos. | `ApprovalRequest`, `Delegation`, `RiskRegister`. |
| **Intelligence** | Projeções, recomendações, cenários, alertas. | `Insight`, `Scenario`, `Recommendation`. |

Diagrama de dependências por domínio: ver [`DOMAIN_MODEL.md`](./DOMAIN_MODEL.md).

## 5. Padrões transversais

- **Tenant context.** Toda requisição autenticada carrega `tenantId` no
  contexto da sessão/JWT. Um interceptor do NestJS seta
  `SET LOCAL app.current_tenant` na transação Prisma, e as policies RLS
  do Postgres impõem o escopo de novo.
- **Money.** `packages/shared/src/money` encapsula `decimal.js` com
  precisão + moeda; aritmética proibida em `number`.
- **Idempotency.** Toda rota mutadora exposta a sistemas externos (app
  do motorista, webhooks, importação) aceita `Idempotency-Key`; dedupe
  persistente por 7 dias (configurável).
- **Outbox.** Mutations relevantes gravam na mesma transação um evento
  no `outbox`; worker publica para consumidores internos e integrações.
- **Optimistic locking.** Entidades com estado crítico carregam `version`;
  updates que não batem versão falham e forçam reload.
- **Audit.** Guard/interceptor global registra ação, autor, motivo
  (quando exigido), before/after (diff), correlação e tenant em
  `audit_event` (append-only; particionado por mês).
- **Fechamento.** Períodos contábeis fechados bloqueiam mutações; reabertura
  exige aprovação e snapshot imutável.

## 6. Arquitetura dentro de cada módulo

Cada bounded context segue um esqueleto **hexagonal**:

```
packages/domain/<context>/
├── core/                 Entidades, value objects, invariantes (puro TS).
├── application/          Casos de uso (orquestração).
├── ports/                Interfaces (repositórios, serviços externos).
└── events/               Eventos de domínio.

apps/api/src/modules/<context>/
├── adapters/
│   ├── prisma/           Implementações das portas usando Prisma.
│   └── http/             Controllers, DTOs, validators.
├── workers/              Consumidores BullMQ.
└── <context>.module.ts
```

Dependências: `adapters` → `application` → `core`. Nunca o inverso.

## 7. Qualidade e DoD

Uma funcionalidade só é "pronta" quando:

1. Código + migração + seeds (demo marcado) + testes.
2. Autorização verificada no servidor (não só UI).
3. Trilha de auditoria onde aplicável.
4. Idempotência e tratamento de falha (estado desconhecido, retry seguro).
5. Textos em pt-BR, moeda em BRL com `Decimal`, timezone correto.
6. Documentação do módulo atualizada (campos, estados, regras, eventos).
7. Linha correspondente em `IMPLEMENTATION_STATUS.md` marcada como `homologado`
   com apontador para o teste.
