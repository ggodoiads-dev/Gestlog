# Catálogo de Módulos — GESTLOG

Cada linha é um módulo (bounded context) com escopo, principais entidades,
dependências de leitura e estado na implementação. O **estado real** fica
em [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md) e é o único
lugar onde "pronto" é afirmado.

| # | Módulo | Escopo | Entidades principais | Lê de | Escreve em |
|---|--------|--------|----------------------|-------|-------------|
| 01 | **Core** | Tenant, pessoas jurídicas, garagens, usuários, perfis, permissões, auditoria, documentos. | `Tenant`, `LegalEntity`, `Garage`, `CostCenter`, `User`, `Role`, `Permission`, `UserRole`, `AuditEvent`, `Document`. | — | Audit, Document |
| 02 | **Clients** | Cadastro de clientes corporativos, unidades, contatos, acessos do portal. | `Client`, `ClientLegalEntity`, `ClientUnit`, `ClientContact`, `ClientPortalUser`. | Core | — |
| 03 | **CLM — Contract Lifecycle** | Contratos, versões, preços, reajustes, SLAs, aditivos, assinatura, ativação, encerramento. | `Contract`, `ContractVersion`, `ContractService`, `PricingComponent`, `SLAClause`, `ContractAdjustment`. | Clients, Core, Governance | Governance (aprovação) |
| 04 | **Smart Routing** | Rotas, versões, pontos, turnos, janelas, restrições, geocodificação. | `Route`, `RouteVersion`, `Stop`, `Turn`. | CLM, Clients | Governance (publicação) |
| 05 | **Workforce** | Motoristas, habilitações, vínculos, escalas, disponibilidade, folgas. | `Driver`, `DriverLicense`, `EmploymentBond`, `Schedule`, `Availability`, `TimeOff`. | Core | — |
| 06 | **Fleet** | Veículos, documentos, custódia, elegibilidade consolidada. | `Vehicle`, `VehicleDocument`, `Custody`, `VehicleEligibilityProjection`. | Workforce, Maintenance, Fuel | — |
| 07 | **Maintenance** | Avarias, OS, liberação técnica, checklist. | `Defect`, `ServiceOrder`, `ServiceOrderItem`, `TechnicalRelease`, `ChecklistSubmission`, `ChecklistTemplate`. | Fleet, Procurement, AP | Fleet (eligibility input) |
| 08 | **Fuel** | Tanques, abastecimentos internos/externos, estoque, consumo, anomalias. | `Tank`, `FuelMovement`, `Fueling`, `FuelPurchase`. | Fleet, Procurement | AP |
| 09 | **AutoDispatch** | Designação oficial, candidatos, aceites, substituições. | `Assignment`, `AssignmentCandidate`, `DispatchSLA`. | Fleet, Workforce, Operations, Smart Routing | Operations |
| 10 | **Operations** | Viagens programadas, execuções, eventos do motorista, validações. | `ScheduledTrip`, `TripExecution`, `OperationalEvent`, `TripValidation`. | Smart Routing, AutoDispatch | Billing (medição) |
| 11 | **Driver App API** | Endpoints idempotentes para app do motorista. | — (reusa Operations/Fleet/Maintenance) | — | Operations, Maintenance |
| 12 | **Billing** | Livro de medição, pré-fatura, documento fiscal. | `BillingMeasurement`, `PreInvoice`, `FiscalDocument`, `FiscalDocumentItem`. | Operations, CLM | AR |
| 13 | **AR** | Contas a receber, recebimentos, cobrança, aging. | `Receivable`, `Receipt`, `ReceiptAllocation`, `CollectionAction`. | Billing, Treasury | Finance |
| 14 | **Procurement** | Requisições, cotações, pedidos, recebimento. | `PurchaseRequest`, `Quote`, `PurchaseOrder`, `GoodsReceipt`. | Budget, Governance | AP, Budget (compromisso) |
| 15 | **AP** | Contas a pagar, pagamentos, 3-way match. | `PayableInvoice`, `Payable`, `Payment`, `PaymentAllocation`. | Procurement, Fuel, Maintenance, Treasury | Finance |
| 16 | **Treasury** | Contas bancárias, movimentos, conciliação híbrida. | `BankAccount`, `BankTransaction`, `Reconciliation`, `ReconciliationMatch`. | AR, AP | Finance |
| 17 | **Budget & Performance** | Baseline, revisado, forecast, compromissos, holds. | `BudgetVersion`, `BudgetLine`, `Commitment`, `Hold`. | Procurement, AP, Finance | — |
| 18 | **Finance** | Fatos gerenciais, DRE, EBITDA, fechamento. | `GeneralLedgerEntry`, `AccountingPeriod`, `EBITDASnapshot`, `AllocationRule`. | AR, AP, Payroll*, Assets, Fuel, Maintenance, Billing | — |
| 19 | **Assets** | Patrimônio, depreciação, inventário, alienação. | `Asset`, `DepreciationSchedule`, `AssetMovement`, `InventoryCount`. | Fleet (vínculo), Procurement | Finance |
| 20 | **CAPEX** | Projetos de investimento, TCO, VPL, benefícios. | `CapexProject`, `CapexCase`, `BenefitRealization`. | Finance, Treasury, Assets | Governance |
| 21 | **Treasury & Debt** | Empréstimos, financiamentos, leasing, covenants. | `DebtContract`, `DebtInstallment`, `Covenant`, `CovenantCheck`. | Treasury | Finance |
| 22 | **Working Capital** | DSO, DPO, aging, NCG, antecipação. | Projeções em cima de AR/AP/Treasury | AR, AP, Treasury | — |
| 23 | **Financial Risk** | Matriz de risco, KRI, stress testing, planos. | `RiskRegister`, `RiskScenario`, `RiskMitigation`. | Finance, Treasury, Operations | Governance |
| 24 | **Governance / Approvals** | Aprovações, delegações, SoD, plantão. | `ApprovalRequest`, `ApprovalStep`, `Delegation`, `RosterOnCall`. | Core | — |
| 25 | **Intelligence** | Insights, projeções, cenários, recomendações. | `Insight`, `Scenario`, `Recommendation`. | Finance, Operations, Fleet | — |
| 26 | **Client Portal** | Experiência isolada para clientes corporativos. | — (reusa Clients, CLM, Operations, AR) | — | Client Portal only writes `ServiceRequest`, `ClientMessage`. |
| 27 | **Admin & Settings** | Configurações do tenant, parametrização, licenciamento. | `TenantSettings`, `FeatureFlag`, `Subscription`. | Core | — |

*Payroll inteiro não está no escopo imediato; o módulo Finance consome
**custos de mão de obra** validados por RH do tenant (integração ou
lançamento manual).* Ver `DECISIONS_AND_OPEN_QUESTIONS.md`.

## Estados de módulo (resumo)

Convenção usada em `IMPLEMENTATION_STATUS.md`:

- `not-started` — nenhum código.
- `scaffolded` — esqueleto (módulo registrado, modelos iniciais, sem regras).
- `in-progress` — pelo menos um caso de uso E2E navegável (não pronto).
- `implemented` — regras de negócio principais cobertas por testes.
- `homologated` — passou pelos casos de aceite em `ACCEPTANCE_TESTS.md`.
- `blocked` — depende de decisão externa ou credencial (ver pendência).
