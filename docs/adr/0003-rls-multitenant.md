# ADR-0003: Isolamento multi-tenant com Row-Level Security do Postgres

Status: Accepted
Date: 2026-11-09

## Contexto

GESTLOG é SaaS multi-tenant com dados financeiros e operacionais
sensíveis. Vazamento entre tenants é inaceitável (ver `AT-01` em
`ACCEPTANCE_TESTS.md`). Precisamos de defesa em profundidade:
não basta "lembrar de filtrar por tenant" no código.

## Decisão

Adotar **três camadas** de isolamento:

1. **Aplicação.** `tenantId` entra no contexto a cada request
   (JWT/sessão) e um guard/interceptor do NestJS garante que toda
   execução de caso de uso ocorre em uma transação com
   `SET LOCAL app.current_tenant = $tenantId`.
2. **Postgres RLS.** Toda tabela multi-tenant tem política:
   ```sql
   CREATE POLICY tenant_isolation ON <tabela>
   USING (tenant_id = current_setting('app.current_tenant')::uuid)
   WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);
   ```
   A role da aplicação (`gestlog_app`) **não é** `BYPASSRLS`. Só a
   role administrativa (`gestlog_platform_admin`) ignora RLS, e
   seu uso é auditado.
3. **Testes.** Suíte `security/tenant-isolation.spec.ts` cria dois
   tenants, popula dados homônimos e tenta exfiltração via URL,
   export, relatório, busca, IA e arquivo. Falha = bloqueio de merge.

### Modelo de dados

- Toda tabela tenant-scoped carrega `tenant_id uuid NOT NULL` com
  índice composto `(tenant_id, …)` nos acessos típicos.
- FKs cruzam apenas dentro do mesmo tenant; constraints verificam.
- A migração que cria uma tabela cria também a policy, no mesmo
  commit; lint custom falha se não existir.

### Compatibilidade com Prisma

O Prisma não seta `SET LOCAL` automaticamente. Usamos
`$transaction(async (tx) => { … })` encapsulando o `SET LOCAL`
antes de qualquer query. O repositório é injetado pelo NestJS para
cada request, nunca o `PrismaClient` nu.

## Alternativas consideradas

| Alternativa | Por que não |
|-------------|-------------|
| Schema-per-tenant | Operações e migrations escalam mal com centenas de tenants; relatórios cross-tenant (ex.: admin da plataforma) ficam penosos. |
| Database-per-tenant | Custo operacional alto; não serve ao SaaS em escala inicial. |
| Só scoping na aplicação | Uma linha esquecida vaza tudo. Inaceitável. |
| Políticas via middleware proxy (ex.: pgBouncer + custom) | Fragiliza o contrato; RLS é padrão testado. |

## Consequências

- Todo código que acessa o banco **precisa** passar pelo helper de
  transação com tenant context. Linter custom + testes fazem valer.
- Migrations têm regra: `tenant_id` + policy = obrigatórios em
  tabelas tenant-scoped.
- Alguns relatórios administrativos cross-tenant precisam usar a
  role admin com auditoria explícita.
- Performance: índices `(tenant_id, …)` substituem muitos
  índices separados; penalidade mínima.

## Notas

Tabelas **globais** (meta-dados do SaaS: planos, feature flags
globais, políticas default) não carregam `tenant_id` e não têm RLS
de tenant — elas usam RLS de "visibilidade" (público vs
administrativo) quando aplicável.
