# Decisões e Pendências — GESTLOG

Três estados possíveis para qualquer item:

- **DECISÃO APROVADA (DA)** — fixada pelo product owner e vinculante para o código.
- **PROPOSTA TÉCNICA (PT)** — escolha feita por Claude Code com justificativa; pode ser contestada.
- **PENDENTE DE VALIDAÇÃO (PV)** — exige input humano (operação, jurídico, contabilidade, cliente). Entra em código apenas como *parâmetro*, nunca como regra definitiva.

## Decisões aprovadas

| ID | Descrição | Origem |
|----|-----------|--------|
| DA-01 | Escopo integral do GESTLOG, sem fases contratuais. | Prompt mestre §29 |
| DA-02 | Rotagrama é o coração; financeiro existe para sustentá-lo. | Adendo §34 |
| DA-03 | Idioma e locale: pt-BR, BRL, timezone operacional local. | Prompt mestre §2 |
| DA-04 | Multi-tenant estrito (isolamento por tenant + RLS). | Prompt mestre §3 |
| DA-05 | Nenhum valor real da Primeira Classe Transportes vira dado produtivo sem validação. | Prompt mestre §48 |
| DA-06 | Decimal em dinheiro; proibido float. | Prompt mestre §3 |
| DA-07 | Idempotência + outbox + auditoria append-only. | Prompt mestre §27 |
| DA-08 | Sem QR de embarque de passageiros no primeiro lançamento. | Prompt mestre §5 |
| DA-09 | Sem suspensão automática de transporte por atraso financeiro. | Prompt mestre §23 |
| DA-10 | Aprovação por silêncio é proibida. | Prompt mestre §15 |

## Propostas técnicas

| ID | Descrição | Alternativas | Status |
|----|-----------|---------------|--------|
| PT-01 | Stack: TypeScript + NestJS + Next.js + Postgres + Prisma + Redis + BullMQ. | .NET 8, Python/FastAPI, Elixir/Phoenix. | ADR-0001 |
| PT-02 | Monorepo pnpm + Turborepo. | npm workspaces, Nx, Rush. | ADR-0002 |
| PT-03 | RLS do Postgres como segunda camada de isolamento multi-tenant. | Apenas scoping na aplicação; schema-per-tenant. | ADR-0003 |
| PT-04 | Paleta provisória (navy #101D30 / acento #3278D3). | Aguardar marca oficial do tenant. | Em uso até DA |
| PT-05 | MapLibre + OSM como mapa default. | Mapbox (pago), Google Maps. | Em uso |
| PT-06 | SendGrid-like SMTP em dev (Mailhog). | — | Em uso |

## Pendentes de validação (parâmetros, **nunca** regras inventadas)

### Operação
- **PV-01** Quantidade real de veículos da Primeira Classe (automóveis,
  micro-ônibus, vans). Prompt informa ~16 clientes, frota NÃO
  confirmada.
- **PV-02** Lista real de clientes ativos e CNPJs.
- **PV-03** Rotas/turnos reais, horários de referência e janelas.
- **PV-04** Garagens, endereços, centros de custo operacionais.

### Comercial / Contratos
- **PV-05** Modelos contratuais reais (fixo, por viagem, km, misto).
- **PV-06** Índices de reajuste pactuados (IPCA, IGP-M, INPC, fórmulas).
- **PV-07** Gatilhos de diesel (quando existirem cláusulas).
- **PV-08** SLAs contratuais específicos e penalidades.

### Financeiro / Fiscal
- **PV-09** Regime tributário (Simples, Lucro Presumido, Lucro Real) por CNPJ.
- **PV-10** Município(s) de emissão e documento aplicável (NFS-e vs CT-e OS).
- **PV-11** Políticas de retenção (ISS, IR, CSLL, INSS, PIS, COFINS).
- **PV-12** Política oficial de rateios (quando contrato for capex).
- **PV-13** Calendário de fechamento por CNPJ.
- **PV-14** Datas de vencimento padrão por cliente (quando contratuais).

### Governança / SoD
- **PV-15** Alçadas monetárias oficiais por categoria de despesa.
- **PV-16** Lista nominal de aprovadores e titulares/backups de plantão.
- **PV-17** SLA interno da central de aprovações (ex.: 5 min é hipótese).
- **PV-18** Política de delegação emergencial (duração padrão).

### Bancos / Fornecedores / Clientes
- **PV-19** Credenciais e contratos com bancos (API/OFX).
- **PV-20** Cadastro completo de fornecedores recorrentes.
- **PV-21** Políticas de crédito por cliente / grupo econômico.
- **PV-22** Contas bancárias por CNPJ com finalidades.

### Patrimônio e Dívida
- **PV-23** Inventário patrimonial inicial (ativos existentes).
- **PV-24** Contratos de financiamento/leasing em vigor.
- **PV-25** Garantias e gravames atuais.

### Pessoas
- **PV-26** Lista nominal de motoristas, habilitações e vínculos.
- **PV-27** Escalas típicas (6x1, 12x36, etc.) e CCT aplicável.
- **PV-28** Política de folgas, férias, afastamentos (regra interna).

### Identidade
- **PV-29** Logotipo, marca oficial e cores da transportadora cliente.
- **PV-30** Nome fantasia da operação de referência.

### SaaS
- **PV-31** Modelo comercial do GESTLOG (mensalidade proposta é hipótese; não é regra).
- **PV-32** Política de offboarding e exportação de dados para tenant.

### LGPD
- **PV-33** Encarregado (DPO) do tenant.
- **PV-34** Prazos de retenção por categoria de dado.

## Fluxo de resolução

1. Item PV vira DA apenas depois de confirmação escrita do responsável
   no tenant (comercial, jurídico, contábil, diretoria).
2. Mudança de DA exige ADR novo.
3. Qualquer "sim por default" em código para contornar PV é **bug**.
