# @gestlog/domain

Núcleo de domínio puro (sem Prisma, HTTP, filas) organizado por
bounded context. Ver `docs/ARCHITECTURE.md` §6.

## Estrutura por contexto (padrão)

```
src/<context>/
├── core/          entidades, VOs, invariantes
├── application/   casos de uso
├── ports/         interfaces (repositórios, serviços externos)
└── events/        eventos de domínio
```

A implementação concreta (Prisma, HTTP, Bull) vive em
`apps/api/src/modules/<context>/adapters/`.

## Contextos planejados

Ver `docs/MODULE_CATALOG.md`.
