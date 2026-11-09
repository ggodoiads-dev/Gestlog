# Segurança e Permissões — GESTLOG

## 1. Isolamento multi-tenant

Três camadas que **todas** precisam passar para um dado ser retornado:

1. **Aplicação.** Toda rota autenticada injeta `tenantId` no contexto. Os
   repositórios do Prisma recebem o escopo pelo tenant-context provider e
   não aceitam query sem ele (um lint custom + revisão + testes bloqueiam
   acessos "nus" ao Prisma client).
2. **Postgres RLS.** Toda tabela multi-tenant tem política `tenant_id =
   current_setting('app.current_tenant')::uuid`. O interceptor seta
   `SET LOCAL app.current_tenant` dentro da transação; fora da
   transação, nenhuma leitura cruza tabelas tenant.
3. **Testes de vazamento.** A suíte E2E tem um bloco dedicado que cria
   dois tenants com dados parecidos (mesmas placas, mesmos nomes de
   clientes) e tenta — via URL direta, exportação, relatório, IA, arquivo
   — acessar o outro. Falha = bloqueio de deploy.

**Operações privilegiadas** (suporte, backup, migração): executadas com
um papel Postgres distinto (`gestlog_platform_admin`), auditadas e
temporárias. Acesso cross-tenant só com justificativa registrada.

## 2. Autenticação

- Login web: Auth.js (sessão HttpOnly, SameSite=Lax, cookie com
  `__Secure-` prefix em produção).
- API móvel (driver app): JWT curto (15 min) + refresh token rotativo.
- MFA TOTP **obrigatório** para perfis sensíveis (aprovador financeiro,
  admin do tenant, SoD-reforçada).
- SSO empresarial (SAML/OIDC) planejado; conector em
  `INTEGRATION_CONTRACTS.md` como *pendente*.
- Nunca armazenamos senha; Argon2id com parâmetros revisáveis.
- Rate limiting por IP + por conta; lockout com backoff.

## 3. Autorização (RBAC + ABAC)

- **RBAC base.** Um usuário carrega *N* papéis (`Role`) em contexto
  (`LegalEntity`, `Garage`, `Client`, `Contract`). Papéis padrão vêm
  seedados (admin, operation_manager, dispatcher, driver, finance,
  treasury, controller, procurement, auditor, client_portal_user, etc.).
- **ABAC.** Policies declarativas em cima do RBAC, para:
  - alçada monetária (`amount <= user.limit`);
  - conflito de interesse (`requester.id != approver.id`);
  - vigência da delegação (`now ∈ [delegation.start, delegation.end]`);
  - restrições por estado (`period.state != CLOSED`);
  - independência SoD (`actor.roles ⊄ incompatibleWith(target.roles)`).
- **Server-side é verdade.** O menu e os botões se adaptam, mas cada
  endpoint revalida. Nunca confiamos no cliente.

## 4. Segregação de funções (SoD)

Matriz mínima, **nunca** burlada mesmo em empresas pequenas:

| Fluxo | Papéis incompatíveis simultaneamente |
|-------|---------------------------------------|
| Compra | Requisitante + Aprovador de compra |
| Compra | Recebedor + Fornecedor (humano/empresa) |
| Pagamento | Aprovador de pagamento + Executor bancário |
| Pagamento | Cadastro de dados bancários do fornecedor + Executor bancário |
| Fechamento | Lançador + Revisor independente |
| Patrimônio | Custodiante + Autorizador de alienação |

Quando a empresa tem poucos funcionários, controles compensatórios
(dupla aprovação, auditoria amostral) substituem a separação física;
**nunca** se removem todos.

## 5. Delegação de autoridade

- **Planejada.** Titular nomeia substituto independente, com escopo,
  limite individual e agregado, vigência (`start` + `end`), revogável.
  Segunda aprovação exigida para ativar. Nunca retroativa.
- **Emergencial.** Autoridade superior previamente habilitada abre;
  segunda aprovação independente antes de ativar; expiração curta
  (ex.: 24h, configurável); escopo mínimo; notificações; revogação.
  Motivos clínicos de ausência **não** aparecem.

## 6. Aprovações

- Serviço central (`Governance`). Toda ação sensível (compra, pagamento,
  reajuste, desconto, CAPEX, alienação, exceção operacional) é uma
  `ApprovalRequest` com:
  - versão imutável do pedido (snapshot);
  - alçada aplicada no momento da decisão (recomputada server-side);
  - trilha de etapas (sequencial ou paralela);
  - justificativa obrigatória quando política exigir.
- **Proibições inegociáveis:**
  - Autoaprovação quando política pede independência.
  - Aprovação tácita por silêncio.
  - Reutilização de aprovação após mudança material (preço, fornecedor,
    conta bancária, escopo, risco).
  - Fracionamento para burlar alçada (detector agregador por período,
    fornecedor, rubrica).

## 7. Auditoria

- `AuditEvent` append-only, particionada por mês. Imutável a nível de
  aplicação; o papel do writer não tem `DELETE` nem `UPDATE`.
- Campos: `tenantId`, `actorUserId`, `actedAsUserId` (quando delegação),
  `action`, `subjectType`, `subjectId`, `subjectVersion`, `before`,
  `after`, `reason`, `correlationId`, `ip`, `userAgent`, `createdAt`.
- Eventos obrigatórios: login/logout, falha de autenticação, mudança de
  papel/permissão, aprovação/rejeição, mudança de dados bancários de
  fornecedor, criação/edição/anulação de documento fiscal, fechamento/
  reabertura de período, alteração de preço contratual, baixa
  patrimonial, acesso a dados pessoais sensíveis.
- Retenção mínima: 5 anos para registros financeiros/fiscais; política
  configurável por tenant respeitando LGPD.

## 8. LGPD (controlador vs operador)

- O GESTLOG é **operador** sobre dados pessoais dos motoristas,
  passageiros eventuais e contatos do cliente; cada tenant é
  **controlador**.
- Minimização: só coletamos o que o fluxo exige (ex.: passageiros
  eventuais têm dado estritamente necessário para embarque, com
  política de retenção curta).
- Direitos do titular: acesso, correção, anonimização, portabilidade,
  exclusão — expostos por tenant via portal administrativo, com
  trilha de auditoria.
- Criptografia: TLS 1.3 em trânsito; AES-256 em repouso para campos
  sensíveis (documentos, dados bancários). Chaves gerenciadas em KMS
  (configurável por deploy).
- Logs: `pino` com `redact` nos campos sensíveis; nunca logar segredos,
  tokens, senhas, CPFs em claro.
- DPIA (relatório de impacto) para integrações que cruzam dados
  pessoais: template em `INTEGRATION_CONTRACTS.md`.

## 9. Secrets e credenciais

- Nenhum segredo em código. `.env.example` lista nomes; valores vivem em
  KMS/secret manager do ambiente.
- Credenciais bancárias/fiscais são criptografadas **em campo**
  (envelope encryption com chave por tenant).
- Rotação planejada; alertas para segredo próximo do vencimento.

## 10. Rate limiting, anti-abuso e proteção de APIs

- Limite por usuário + IP + rota + tenant; configurável por rota.
- Proteção contra enumeração: respostas 404 vs 403 padronizadas;
  mensagens de erro não vazam existência.
- Proteção de upload: tipos permitidos, antivírus, limite de tamanho,
  sandbox de leitura.
- URLs assinadas e com expiração para documentos; cada acesso audita.

## 11. Observabilidade de segurança

- Alertas para: falhas de login em massa, uso de delegação próximo do
  limite, aprovações fora do horário habitual, alteração de dados
  bancários de fornecedor, acessos entre tenants (deve ser impossível —
  se ocorrer, incidente crítico).
- Dashboards operacionais em
  [`DEPLOYMENT_AND_OPERATIONS.md`](./DEPLOYMENT_AND_OPERATIONS.md).

## 12. Incidentes

- Runbook em `DEPLOYMENT_AND_OPERATIONS.md` com: classificação, SLAs de
  resposta, comunicação ao controlador, comunicação à ANPD quando
  cabível, pós-mortem público-para-tenant e lições aprendidas.
