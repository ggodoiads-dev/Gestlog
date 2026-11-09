# @gestlog/api — Backend NestJS

Monólito modular do GESTLOG. Cada bounded context (ver `docs/MODULE_CATALOG.md`)
vira um `@Module` em `src/modules/<context>/`.

## Estado atual

- `main.ts` + `app.module.ts` com logger pino, ConfigModule global e
  OpenAPI em `/docs`.
- `/health`, `/health/ready`, `/health/integrations` já reportam
  honestamente o estado "pending".
- `TenantContextService` com `AsyncLocalStorage` para propagar
  `TenantContext` por requisição — base da camada RLS (ADR-0003).

## Próximos módulos

Seguindo a priorização em `docs/IMPLEMENTATION_STATUS.md`:

1. `modules/core` — tenant/users/roles/permissions + auth + auditoria.
2. `modules/routing` — Smart Routing (coluna vertebral).
3. `modules/fleet` — veículos + elegibilidade.
4. `modules/operations` — viagens programadas, execuções, eventos.
5. `modules/autodispatch` — designação atômica.
6. `modules/clm`, `modules/clients`, `modules/billing`, etc.
