# Contratos de Integração — GESTLOG

> Nenhuma integração é marcada como "pronta" sem credenciais
> configuradas, sandbox homologado, teste de contrato automatizado e
> runbook de falha. Enquanto isso, o módulo correspondente opera em
> **modo demo** explícito e documentado.

## 1. Princípios

- Cada integração tem **adapter** isolado em `apps/api/src/integrations/<provedor>/`,
  com interface de porta em `packages/domain`.
- Credenciais via secret manager; nunca em código.
- Idempotency key em toda chamada mutadora.
- Outbox para publicação externa; retries com backoff; dead-letter.
- Status "desconhecido" **sempre** faz consulta antes de retry.
- Health check por integração publicado em `/health/integrations`.
- Toda chamada registra latência, status, request-id e correlação.

## 2. Catálogo (status inicial: PENDENTE até homologação)

| # | Integração | Finalidade | Provedores previstos | Status |
|---|------------|-----------|----------------------|--------|
| 1 | **NFS-e municipal** | Emissão de NFS-e de serviço de transporte | focus-nfe, PlugNotas, API do município | PENDENTE |
| 2 | **CT-e OS** | Conhecimento de Transporte Eletrônico (quando aplicável) | focus-nfe, PlugNotas, Sefaz direto | PENDENTE |
| 3 | **Open Finance / bancos (leitura)** | OFX, API read-only de extrato | Bradesco, Itaú, Santander, Caixa, Sicoob, BB; Belvo, Pluggy | PENDENTE |
| 4 | **Pagamentos bancários** | Pagamento via API bancária (CNAB opcional) | Bradesco iShop, Itaú Bankline, Santander, BB APIs | PENDENTE |
| 5 | **Boletos / cobrança** | Emissão e baixa | Bancos + gateways (Gerencianet, Asaas, Iugu) | PENDENTE |
| 6 | **PIX** | Cobrança e pagamento PIX | API de PSPs | PENDENTE |
| 7 | **Telemática / GPS** | Posições e eventos de veículo | 4C Sistemas, Sascar, Omnilink, Teltonika, próprias | PENDENTE |
| 8 | **Mapas e roteirização** | Geocodificação, matriz de distâncias, roteirização | MapLibre + Nominatim (self-host), OpenRouteService, Mapbox, Google | MapLibre tiles OSS **inclusos** por padrão; serviços pagos pendentes |
| 9 | **Assinatura eletrônica** | Contratos, aditivos, documentos | Clicksign, D4Sign, DocuSign, ZapSign | PENDENTE |
| 10 | **E-mail transacional** | Notificações | SES, SendGrid, Postmark | PENDENTE |
| 11 | **WhatsApp Business** | Motorista + cliente portal (quando autorizado) | Twilio, Meta Cloud API | PENDENTE |
| 12 | **SSO (SAML/OIDC)** | Entrada corporativa | Azure AD, Google Workspace, Okta | PENDENTE |
| 13 | **KMS / Secret Manager** | Chaves e segredos | HashiCorp Vault, AWS KMS, GCP KMS | A definir por deploy |
| 14 | **Object storage** | Documentos privados | S3-compatível (MinIO em dev; S3/GCS/R2 em prod) | PENDENTE |
| 15 | **Antivírus de upload** | Varredura de documentos | ClamAV (self-host), VirusTotal | PENDENTE |

## 3. Template de contrato de integração

Cada integração mantém um arquivo em
`docs/integrations/<slug>.md` com:

1. **Finalidade de negócio** e módulos consumidores.
2. **Pré-requisitos**: credenciais necessárias, ambientes (sandbox,
   prod), limites de uso.
3. **Dados de entrada e saída** (schemas Zod).
4. **Erros esperados** e política (retry, backoff, dead-letter, escalada
   humana).
5. **Idempotency**: chave, janela, dedupe.
6. **Estado desconhecido**: endpoint de consulta, timeout, política.
7. **Compliance**: dados pessoais trafegados, DPIA, retenção.
8. **Monitoramento**: métricas, alertas, dashboards.
9. **Runbook de falha**: diagnóstico, comunicação, fallback manual.
10. **Testes de contrato** (pact-like) e snapshot de resposta.

## 4. Modo demo

Enquanto uma integração não estiver homologada:

- A UI exibe um **banner de modo demo** em qualquer tela afetada.
- Nenhum dado fictício é persistido como "produção" (todos marcados
  `__demo__ = true`).
- Operações críticas (pagamento, emissão fiscal, bloqueio operacional)
  ficam **bloqueadas**; não há fallback silencioso.

## 5. Testes de contrato

- Snapshots por provedor em `apps/api/tests/contracts/<provedor>/`.
- Mock server local via `msw` para desenvolvimento.
- CI roda testes de contrato contra mocks; smoke test opcional contra
  sandbox do provedor (segredos apenas em pipeline autorizado).

## 6. Trilha de evidência

Qualquer alteração em um contrato de integração entra como ADR + PR
com apontamento em `IMPLEMENTATION_STATUS.md`.
