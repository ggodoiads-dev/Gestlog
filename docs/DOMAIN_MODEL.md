# Modelo de Domínio — GESTLOG

> Este documento descreve o modelo **conceitual**. A implementação física
> (Prisma schema, índices, RLS) está em `packages/db/prisma/schema.prisma`.
> Ambos evoluem juntos; divergência é bug.

## 1. Os quatro registros canônicos

Antes de descrever entidades, firmamos os **quatro registros canônicos
transversais** declarados no prompt mestre:

1. **Livro de medição contratual** (`BillingMeasurement`) — componentes
   faturáveis vinculados a contrato/versão, serviço, competência,
   quantidade, unidade, preço vigente, elegibilidade, evidência.
   **Não é uma segunda tabela de contas a receber.**
2. **Elegibilidade consolidada do veículo** (`VehicleEligibilityProjection`)
   — projeção read-only computada por `Fleet` a partir de documentos,
   manutenção, checklist/custódia e bloqueios. AutoDispatch e Operations
   consultam; não criam status paralelos.
3. **Designação operacional oficial** (`Assignment`) — fonte única sobre
   quem (motorista) opera o que (veículo) em qual viagem/trecho.
4. **Camada canônica de fatos financeiros gerenciais**
   (`GeneralLedgerEntry` gerencial + dimensões) — alimenta DRE, orçamento,
   EBITDA e Intelligence sem indicadores paralelos.

Qualquer "visão" ou cache em outro módulo é derivada e marcada como tal.

## 2. Hierarquia de tenants e entidades jurídicas

```
Tenant                          — transportadora que assina o SaaS
 └── LegalEntity (CNPJ)         — pessoa jurídica própria da transportadora
      └── Garage                — unidade operacional (garagem/base)
           └── CostCenter       — centro de custo

Tenant
 └── Client (grupo econômico)   — cliente contratante
      └── ClientLegalEntity     — CNPJ do cliente (quando distinto do grupo)
           └── ClientUnit       — planta, filial, fábrica, hospital
```

Regras:

- `Tenant` ≠ `LegalEntity`. Um tenant pode ter várias LEs (ex: holding
  com 2 CNPJs).
- `Garage` sempre pertence a exatamente **uma** `LegalEntity`.
- `Client` é do tenant; não há cliente compartilhado entre tenants.
- Consolidações gerenciais entre LEs são permitidas com eliminação
  rastreável; **nunca** compensação automática de caixa/dívida entre LEs.

## 3. Comercial, contratos e preços

```
Client ─< Contract ─< ContractVersion ─< ContractService
                                           │
                                           ├─< PricingComponent
                                           ├─< SLAClause
                                           └─< ContractAttachment

Contract ─< ContractAdjustment (reajustes/aditivos; versionados)
```

- `Contract` tem vigência, status (`draft` → `under_review` → `approved` →
  `signed_pending_activation` → `active` → `suspended` | `terminated`).
- Cada **versão** é imutável após aprovação. Mudanças materiais criam
  nova versão e invalidam aprovações vinculadas à versão antiga.
- `PricingComponent` suporta: `monthly_fixed`, `per_trip`, `per_km`,
  `per_vehicle_available`, `occasional`, `mix` (regras compostas).
- Km faturável ≠ km operacional. Cada contrato declara qual componente de
  km (produtivo, posicionamento, retorno) é faturável.
- Reajuste exige: cláusula + data-base + índice + fórmula + aprovação +
  aditivo (quando exigido). Nunca retroativo sem base contratual.

## 4. Rotagrama (Smart Routing + Operations)

```
Contract ─< Route ─< RouteVersion ─< Stop (ordenado)
                                      │
                                      └─< Turn (ida/volta, janela, hora-alvo)

RouteVersion ─< ScheduledTrip (expansão por calendário)
                    │
                    ├─< Assignment (veículo + motorista)
                    └─< TripExecution
                           └─< OperationalEvent
```

- `Route` é um conceito estável (ex.: "Centro → Fábrica Jandira — Turno A").
- `RouteVersion` é imutável quando publicada; traz os pontos, itinerário,
  turno(s), capacidade mínima, veículo elegível.
- `ScheduledTrip` é a **expansão** da versão vigente no calendário
  operacional (dias úteis, feriados, exceções). Alterar a versão **não**
  reescreve viagens já executadas; viagens futuras assumem a próxima
  versão vigente.
- `Assignment` é o único registro oficial de quem opera o quê.
- `TripExecution` acumula eventos (apresentação, posicionamento, início
  de viagem, chegada, encerramento, retorno, fim de jornada). Cada evento
  é um `OperationalEvent` com origem (`driver_app`, `supervisor`,
  `gps`, `manual`), timestamp do dispositivo + servidor, precisão,
  frescor, confiança.
- **GPS na garagem ≠ entrega de custódia ≠ fim de viagem ≠ disponibilidade.**

## 5. Frota, custódia, manutenção

```
Vehicle ─< VehicleDocument (CRLV, seguro, vistorias)
        ─< Custody (motorista responsável atual + histórico)
        ─< Defect (persistente, não zera por troca de motorista)
        ─< ChecklistSubmission (uma por nova custódia e por evento relevante)
        ─< ServiceOrder (OS) ─< TechnicalRelease
        ─< VehicleEligibilityProjection (read-only, computada)

Vehicle ↔ Asset (quando patrimônio é próprio; relação opcional 1:1)
```

- `Vehicle` tem **identidade técnica interna** estável (não é a placa).
  Placa pode mudar; chassi é único.
- `Defect` tem severidade (`critical`, `moderate`, `minor`); crítico
  bloqueia despacho.
- Motorista pode relatar "parece resolvido" num checklist, mas **só
  autoridade técnica qualificada** fecha defeito crítico.
- `VehicleEligibilityProjection` consolida: documentos válidos, defeitos
  abertos, OS em andamento, checklist exigido, bloqueios manuais →
  produz `isEligible: boolean + reasons[]`.

## 6. Workforce

```
Driver ─< DriverLicense (categoria, validade, restrições)
       ─< EmploymentBond (vínculo CLT, autônomo, etc.)
       ─< Schedule (escala formal)
       ─< Availability (declarada)
       ─< TimeOff (férias, afastamento — campos sensíveis protegidos)
```

- Disponibilidade declarada **não revoga** restrição contratual/legal.
- Evento operacional não vira folha automaticamente.

## 7. Combustível

```
Tank ─< FuelMovement (entrada: compra; saída: dispensação)

Fueling (abastecimento externo direto no veículo OU dispensação do tanque)
    ├── sourceType = EXTERNAL_PURCHASE  → gera FuelPurchase + custo
    └── sourceType = INTERNAL_TANK      → consome FuelMovement, aloca custo
```

- Comprar diesel para o tanque: `FuelPurchase` + entrada no `FuelMovement`.
- Abastecer veículo pelo tanque: saída no `FuelMovement` + aloca custo ao
  veículo. **Não cria nova compra.**
- Reconciliação físico × sistema por tanque, por período.

## 8. Financeiro operacional

```
TripExecution (validada)
    └─< BillingMeasurement (livro de medição)
            └─< FiscalDocumentItem
                     └── FiscalDocument (NFS-e / CT-e OS / etc. quando aplicável)
                              └─< Receivable (contas a receber)
                                       └─< ReceiptAllocation ─> Receipt
                                                                    └── BankTransaction

PurchaseRequest ─< PurchaseOrder ─< GoodsReceipt ─< PayableInvoice
                                                          └─< Payable
                                                                   └─< PaymentAllocation ─> Payment
                                                                                                 └── BankTransaction

BankAccount ─< BankTransaction ─< Reconciliation (1:1, 1:N, N:1)
```

- Estados independentes e distintos: *executado* → *validado* → *medido*
  → *pré-faturado* → *documento fiscal autorizado* → *AR* → *recebido*
  → *conciliado*.
- Pagamentos podem liquidar múltiplos títulos (N:1) e um título pode ser
  liquidado por múltiplos pagamentos (1:N). Idem conciliação bancária.
- Status "desconhecido" em integração externa (banco/fiscal) força
  consulta antes de qualquer retry.

## 9. Orçamento, DRE, EBITDA

```
BudgetVersion (BASELINE | REVISED | FORECAST)
    └─< BudgetLine (rubrica × dimensão × período)

Commitment (reserva orçamentária firme)
Hold (reserva temporária com expiração)

Período contábil: AccountingPeriod
    ├── state: OPEN | CLOSING | CLOSED | REOPENED
    └── snapshot imutável quando CLOSED

GeneralLedgerEntry (gerencial)
    ├── competência
    ├── valor (Decimal)
    ├── dimensões: LegalEntity, Garage, CostCenter, Client, Contract, Route, Vehicle
    └── origem rastreável

EBITDASnapshot (por período, versão, dimensão)
```

- `Disponível = orçamento_vigente − realizado − compromissos_firmes − holds_válidos`
  sem dupla contagem quando compromisso vira realizado.
- `EBITDA` não inclui depreciação/amortização/juros/IR.
- `EBITDA LTM` ≠ `EBITDA YTD`. Ambos coexistem com rótulo.

## 10. Governança

```
ApprovalRequest
    ├── subjectType (purchase, payment, contract, pricing_exception, capex, asset_sale, etc.)
    ├── subjectId + subjectVersion
    ├── alçada aplicada (dinâmica, por tenant)
    └─< ApprovalStep (sequencial ou paralela)
            └── decision (APPROVE | REJECT | RETURN) + justificativa

Delegation (planejada ou emergencial)
    ├── escopo, limite individual/agregado, vigência
    └── independência (sem autoaprovação, sem retroatividade)
```

- Aprovação por silêncio é proibida.
- Mudança material da solicitação invalida aprovações anteriores da versão
  antiga.

## 11. Patrimônio

```
Asset
    ├── identidade patrimonial única
    ├── vínculo opcional 1:1 com Vehicle (quando frota própria)
    ├── estado: in_implementation | available | in_use | idle | in_maintenance
    │           transferred | sold | written_off
    └─< DepreciationSchedule (por componente, prospectiva)

InventoryCount ─< InventoryCountItem (divergência → investigação independente)
```

## 12. Auditoria e documentos

```
AuditEvent (append-only, particionado por mês)
    ├── tenantId, actorUserId, actedAsUserId, correlationId
    ├── action, subjectType, subjectId, subjectVersion
    ├── before (JSONB), after (JSONB), reason
    └── createdAt

Document
    ├── storageKey (storage privado, URLs assinadas)
    ├── sha256
    ├── acl (vínculos + permissões)
    └── versionedChain
```

## 13. O que **não** é modelo de domínio do GESTLOG (por ora)

- Cadastro de passageiros individuais do fretamento contínuo — não existe
  no MVP; o planejamento é por rota/ponto/turno.
- Escrituração fiscal oficial — o sistema **auxilia** com documentos
  gerados e conciliados, mas não substitui o contador.
- Rastreamento em tempo real como funcionalidade central — temos
  consumo de GPS com *frescor explícito*; não vendemos ilusão de
  tempo real.
