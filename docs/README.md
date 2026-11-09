# Documentação do GESTLOG

Esta pasta é o **contrato do produto**. Toda decisão técnica ou de negócio que
guia o código precisa estar aqui. Se não está aqui, não é decisão — é
suposição.

## Índice

| Documento | Propósito |
|-----------|-----------|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Stack, camadas, fronteiras de módulo, padrões transversais. |
| [`PRODUCT_REQUIREMENTS.md`](./PRODUCT_REQUIREMENTS.md) | Requisitos funcionais por módulo (origem no prompt mestre v2.0). |
| [`DOMAIN_MODEL.md`](./DOMAIN_MODEL.md) | Entidades, relações, estados, registros canônicos. |
| [`SECURITY_AND_PERMISSIONS.md`](./SECURITY_AND_PERMISSIONS.md) | Isolamento multi-tenant, RBAC+ABAC, LGPD, SoD, auditoria. |
| [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) | Tokens, componentes, tom de voz visual, acessibilidade. |
| [`MODULE_CATALOG.md`](./MODULE_CATALOG.md) | Todos os módulos do GESTLOG com escopo e dependências. |
| [`INTEGRATION_CONTRACTS.md`](./INTEGRATION_CONTRACTS.md) | Contratos com bancos, fiscal, GPS, assinatura. |
| [`ACCEPTANCE_TESTS.md`](./ACCEPTANCE_TESTS.md) | Casos ponta-a-ponta que o sistema precisa passar. |
| [`DECISIONS_AND_OPEN_QUESTIONS.md`](./DECISIONS_AND_OPEN_QUESTIONS.md) | O que foi decidido, o que está em aberto, o que é parâmetro a validar. |
| [`DEPLOYMENT_AND_OPERATIONS.md`](./DEPLOYMENT_AND_OPERATIONS.md) | Deploy, observabilidade, runbooks, backups. |
| [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md) | **Matriz de rastreabilidade.** |
| [`adr/`](./adr/) | Decisões arquiteturais (ADRs) numeradas e imutáveis. |

## Regras de edição

1. **Documentos não são aspiração.** Se um requisito ainda não foi
   implementado, ele aparece em `IMPLEMENTATION_STATUS.md` como `pending`,
   `in-progress` ou `blocked` — não some do catálogo só porque ainda não tem
   código.
2. **ADRs são imutáveis.** Uma decisão arquitetural errada vira um novo ADR
   que supersede o antigo; nunca se edita um ADR já publicado.
3. **Decisões não validadas precisam aparecer em `DECISIONS_AND_OPEN_QUESTIONS.md`.**
   Nenhuma regra inventada (SLA, alçada, índice de reajuste, política fiscal)
   entra em código sem estar lá, marcada como **pendente de validação**.
4. **Sem porcentagens sem evidência.** Nenhum documento afirma "% pronto"
   sem apontar o teste automatizado ou a demo que sustenta a afirmação.
