# Requisitos de Produto — GESTLOG

Esta é a versão operativa (seccionada por módulo) do prompt mestre v2.0.
O texto original consta em [`source/PROMPT_MASTER_v2.md`](./source/PROMPT_MASTER_v2.md)
(anexo imutável; usamos como referência).

A matriz de rastreabilidade requisito → código → teste → status fica em
[`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md).

## 1. Promessa de produto

GESTLOG é a central de comando da transportadora de fretamento
corporativo. Substitui controles fragmentados por fonte única e
confiável, cobrindo planejamento, execução, pessoas, veículos,
manutenção, combustível, contratos, faturamento, compras, tesouraria,
orçamento, patrimônio, rentabilidade, risco e inteligência.

O **Rotagrama** é o coração. Toda a camada financeira existe para
tornar esse transporte seguro, pontual, eficiente e rentável.

## 2. Perfis de usuário

Proprietário/diretoria, gestor geral, operação/CCO, escalistas, líderes
de garagem, motoristas, manutenção, abastecimento, RH/Workforce,
comercial, contratos, faturamento, contas a pagar, tesouraria,
controladoria, patrimônio, segurança, auditoria e clientes corporativos
com acesso restrito.

## 3. Requisitos funcionais — por módulo

As seções abaixo resumem os requisitos essenciais e **vinculantes**.
Detalhe de regras complexas (estados, invariantes) está em
[`DOMAIN_MODEL.md`](./DOMAIN_MODEL.md) e em
[`ACCEPTANCE_TESTS.md`](./ACCEPTANCE_TESTS.md).

### 3.1 Core (identidade, segurança, auditoria)
- Multi-tenant rigoroso (ver `SECURITY_AND_PERMISSIONS.md`).
- Cadastros mestres: pessoas jurídicas, garagens, centros de custo,
  usuários, perfis, permissões.
- Auditoria append-only.
- Documentos em storage privado com ACL e URLs assinadas.

### 3.2 Clients / Portal
- Clientes corporativos, unidades, contatos, acessos segregados por
  tenant e cliente.
- Perfis internos do cliente (RH, gestor, financeiro, auditor).
- Importação de passageiros eventuais por CSV/Excel (apenas eventual).
- Portal com visão de contratos/rotas autorizados, serviços prestados,
  indicadores, documentos, solicitações, faturas quando perfil permitir.

### 3.3 CLM (contratos)
- Governança Modelo A: Comercial → Operações → Finance → Jurídico →
  Diretoria → Assinatura → Ativação. Sem aprovação tácita.
- Versões imutáveis após aprovação; mudança material reabre validações.
- Reajuste: elegibilidade por cláusula + data-base + fórmula + aprovação
  + aditivo quando exigido.
- SLAs diferenciam contratual de indicador interno; evidências GPS têm
  confiança/frescor; penalidades/bonificações decididas por humano.
- Encerramento com plano de continuidade.

### 3.4 Smart Routing (Rotagrama)
- Rotas recorrentes estáveis, versionadas; não exigem lista diária de
  passageiros.
- Rotas eventuais: importação, validação, geocodificação,
  deduplicação, respeito a janela de fechamento.
- Caminhada preferencial ≤ 500 m (exceções); chegada ao destino ≥ 10
  min antes do turno (configurável; distinto de SLA).
- Rascunho → validação → análise de impacto → aprovação → publicação →
  vigência; publicação não altera viagens já executadas.
- Rotagrama é tela assinatura.
- **Sem QR de embarque de passageiros no primeiro lançamento.**

### 3.5 AutoDispatch
- Designação oficial atômica (motorista + veículo + viagem).
- Elegibilidade vem de `VehicleEligibilityProjection` (fonte única).
- Classificação de candidatos com justificativa.
- Reserva/hold com expiração; aceite; escalonamento humano quando não
  houver candidato seguro.
- Estados: planejado → designado → convocado → aceito → apresentado →
  posicionado → iniciado → concluído → validado | cancelado | exceção.

### 3.6 Workforce
- Escalas formais + disponibilidade declarada + disponibilidade operacional.
- Legal / contratual sempre prevalece.
- Evento operacional não vira folha automaticamente.

### 3.7 Driver App
- PWA offline-first; fila idempotente.
- Checklist por **nova custódia** (não a cada viagem).
- Eventos distintos: apresentação, posicionamento, início, chegada,
  encerramento, retorno, fim de jornada.
- Interfaces não exigem interação durante condução.

### 3.8 Fleet
- Identidade técnica interna estável (placa pode mudar).
- Estados independentes: disponível, reservado, em operação, em
  manutenção, bloqueado, inativo, alienado.
- Km total ≠ km produtivo ≠ km faturável.

### 3.9 Maintenance & Safety
- Checklist por categoria (ônibus, micro-ônibus, van, carro).
- Defeito persistente (não some por troca de motorista).
- Liberação técnica por autoridade qualificada, separada de aprovação
  financeira.
- OS com triagem, orçamento, autorização, execução, peças/serviço,
  evidência, aceite técnico, liberação, custo, histórico.

### 3.10 Fuel
- Compra externa direta no veículo = `Fueling` externo + custo.
- Compra para tanque interno = `FuelPurchase` + entrada de estoque.
- Dispensação interna = saída de estoque + custo ao veículo (sem
  segunda compra).
- Método cheio-a-cheio para km/L real; estimativas marcadas.

### 3.11 Billing & Fiscal
- Livro de medição canônico.
- Estados distintos: executado → validado → medido → pré-faturado →
  documento fiscal autorizado → AR → recebido → conciliado.
- Fiscal brasileiro parametrizável (NFS-e / CT-e OS quando aplicável);
  nenhum compliance fiscal universal é assumido.

### 3.12 AR / Cobrança
- Aging por data-base; promessa de pagamento ≠ recebimento.
- Cobrança por etapas, canais autorizados, LGPD.
- **Nunca suspender transporte automaticamente por atraso.**

### 3.13 Procurement
- Requisição → aprovação → cotação → pedido → recebimento → NF → AP.
- 3-way match pedido/recebimento/NF.
- Compra emergencial com aprovação acelerada **antes** da compra;
  regularização documental pode ser depois.
- Proibição de fracionamento.

### 3.14 AP / Pagamentos
- Autorização específica de pagamento distinta de aprovação da compra.
- Execução bancária por perfil SoD distinto.
- Status "desconhecido" nunca gera retry cego.

### 3.15 Treasury & Reconciliação
- OFX / CSV / API read-only / manual.
- Movimentos canônicos imutáveis; dedupe entre fontes.
- 1:1, 1:N, N:1; transferências próprias em duas pontas sem virar
  receita/despesa.

### 3.16 Budget
- Baseline imutável + Revisado aprovado + Forecast (12m).
- Disponível = orçamento vigente − realizado − compromissos − holds
  (sem dupla contagem).
- Verba suplementar aprovada em separado.

### 3.17 Finance (DRE/EBITDA)
- Fechamento mensal com checklist por empresa/garagem/competência.
- Reabertura só com aprovação e snapshot imutável.
- EBITDA mensal, LTM, YTD, curva anual de captura (baseline acumulado,
  realizado YTD, forecast remanescente, projeção, gap, run-rate).
- Alocações com qualidade de dados exibida.

### 3.18 CAPEX
- Fluxo: proposta (com alternativas, inclusive não investir) → TCO →
  aprovação técnica + financeira + estratégica independentes →
  contratação → execução → aceite → capitalização → revisão de
  benefícios 3/6/12m.

### 3.19 Assets
- Identidade patrimonial única; vínculo opcional com veículo.
- Depreciação prospectiva; impairment por análise contábil.
- Inventário periódico/rotativo; ausência não baixa automaticamente.
- Alienação com restrições (gravames) verificadas.

### 3.20 Debt & Treasury
- SAC, Price, bullet, cronogramas personalizados.
- Covenants com fórmula contratual, evidência, waiver formal.
- Dívida líquida ≠ EBITDA.

### 3.21 Working Capital
- DSO, DPO, NCG, aging por data-base.
- Antecipação de recebíveis sem antecipar duas vezes o mesmo título.

### 3.22 Financial Risk
- Matriz 5×5, risco inerente/residual.
- Stress testing coerente (cenário combinado recalcula receita, custo,
  demanda, combustível, NCG, caixa, EBITDA, covenants).

### 3.23 Governance (Aprovações)
- Serviço central; alçadas por tenant, módulo, valor, risco, fornecedor.
- Plantão 24/7, delegação planejada e emergencial.
- Sem autoaprovação, sem silêncio, sem fracionamento.

### 3.24 Intelligence
- Insights explicáveis com origem, confiança, ação sugerida e revisão
  humana.
- IA nunca decide aprovações, segurança técnica, pagamentos.

## 4. Não-objetivos (declaração explícita)

- **Rastreamento em tempo real** com SLA de tempo real não é promessa.
  Consumimos GPS com frescor explícito.
- **Escrituração fiscal oficial** não é substituída; auxiliamos com
  documentos/conciliação.
- **Cadastro de passageiros individuais** no fretamento contínuo não
  está no MVP.
- **Fases contratuais** não são usadas como limite de escopo; o escopo é
  integral.

## 5. Parâmetros a validar (pendentes)

Ver `DECISIONS_AND_OPEN_QUESTIONS.md`. Nenhum número inventado entra em
código como regra definitiva: alçadas (R$), SLAs, cláusulas
específicas, regime tributário, mensalidades SaaS, política de rateios,
identidade visual oficial.
