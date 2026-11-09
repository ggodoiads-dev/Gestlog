# GESTLOG

**Sua transportadora sob controle.**

ERP SaaS multi-tenant para transportadoras brasileiras de fretamento corporativo
de colaboradores. O coração do produto é o **Rotagrama** (planejamento e
execução de rotas, turnos, motoristas e veículos para transporte de
colaboradores de clientes corporativos). A camada financeira, patrimonial e de
inteligência existe para dar segurança, previsibilidade e rentabilidade a essa
operação.

> Este repositório contém o produto em construção. Nada aqui representa
> integração em produção, dados reais de operação ou compliance fiscal/jurídico
> homologado enquanto não houver evidência explícita no diretório `docs/`.

---

## Documentação

Toda a direção técnica e de produto vive em [`docs/`](./docs/README.md):

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — Arquitetura, stack escolhida e justificativa.
- [`docs/PRODUCT_REQUIREMENTS.md`](./docs/PRODUCT_REQUIREMENTS.md) — Requisitos funcionais consolidados.
- [`docs/DOMAIN_MODEL.md`](./docs/DOMAIN_MODEL.md) — Modelo de domínio e registros canônicos.
- [`docs/SECURITY_AND_PERMISSIONS.md`](./docs/SECURITY_AND_PERMISSIONS.md) — Multi-tenant, RBAC/ABAC, LGPD, SoD.
- [`docs/DESIGN_SYSTEM.md`](./docs/DESIGN_SYSTEM.md) — Tokens, componentes, tom visual.
- [`docs/MODULE_CATALOG.md`](./docs/MODULE_CATALOG.md) — Catálogo de módulos e responsabilidades.
- [`docs/INTEGRATION_CONTRACTS.md`](./docs/INTEGRATION_CONTRACTS.md) — Integrações externas (bancos, fiscal, GPS).
- [`docs/ACCEPTANCE_TESTS.md`](./docs/ACCEPTANCE_TESTS.md) — Casos de aceite ponta a ponta.
- [`docs/DECISIONS_AND_OPEN_QUESTIONS.md`](./docs/DECISIONS_AND_OPEN_QUESTIONS.md) — Decisões, pendências e parâmetros não validados.
- [`docs/DEPLOYMENT_AND_OPERATIONS.md`](./docs/DEPLOYMENT_AND_OPERATIONS.md) — Deploy, observabilidade e runbooks.
- [`docs/IMPLEMENTATION_STATUS.md`](./docs/IMPLEMENTATION_STATUS.md) — **Matriz de rastreabilidade requisito → código → teste → status.**

ADRs (registros de decisão arquitetural) estão em [`docs/adr/`](./docs/adr/).

---

## Status atual

Ver [`docs/IMPLEMENTATION_STATUS.md`](./docs/IMPLEMENTATION_STATUS.md). Qualquer
afirmação de "pronto" só é válida se o requisito aparece lá marcado como
`homologado` com evidência (teste automatizado + demonstração).
