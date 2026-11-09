# ADR-0001: Stack principal

Status: Accepted
Date: 2026-11-09

## Contexto

O GESTLOG precisa cobrir simultaneamente:

- Um backend transacional pesado (contratos, faturamento, pagamentos,
  orçamento, fechamento, EBITDA) com invariantes atômicos e
  auditoria.
- Um frontend administrativo denso (tabelas financeiras, central de
  aprovações, rotagrama como torre de controle).
- Um PWA para motoristas, offline-first, com sincronização
  idempotente.
- Multi-tenant estrito, RLS no banco e verificação server-side em
  todas as APIs.
- Integrações brasileiras (NFS-e, CT-e OS, bancos, PIX,
  telemática), em geral com SDKs/HTTP em TypeScript/Python/.NET.

O time de implementação é único (Claude Code agindo como arquiteto,
engenheiro e QA). Precisamos de uma stack onde a mesma linguagem
cubra API, workers, front e PWA, com tipagem forte e boa DX.

## Decisão

Adotar **TypeScript (strict)** em toda a stack, com:

- **Backend:** NestJS 10 (módulo + DI + guards + interceptors).
- **Banco:** PostgreSQL 16 (RLS, `numeric`, JSONB, `pg_trgm`).
- **ORM:** Prisma 5 (type-safe, migrations, interactive transactions).
- **Fila/Eventos:** BullMQ sobre Redis 7 + outbox transacional em
  Postgres.
- **Front administrativo:** Next.js 15 (App Router) + React 19
  + Tailwind 4 + componentes próprios (base `shadcn/ui` fortemente
  customizada) + TanStack Query/Table + React Hook Form + Zod.
- **Driver PWA:** Next.js 15 separado + service worker + IndexedDB.
- **Validação:** Zod em contratos compartilhados.
- **Dinheiro:** `decimal.js` encapsulado em `Money` value object.
- **Logs:** pino.
- **Observabilidade:** OpenTelemetry.
- **Testes:** Vitest + Playwright + Supertest.

## Alternativas consideradas

| Alternativa | Por que não |
|-------------|-------------|
| **.NET 8 + Blazor** | Excelente para financeiro, mas o PWA do motorista e o compartilhamento de tipos entre front e back pedem TypeScript. Ecossistema brasileiro de SDKs ainda favorece JS/Node. |
| **Python/FastAPI + SQLAlchemy** | Produtividade alta, mas tipagem fica mais frágil, especialmente em contratos compartilhados com o front/PWA. Workers assíncronos exigem mais engenharia. |
| **Elixir/Phoenix LiveView** | Soluções elegantes para tempo real, porém ecossistema fiscal brasileiro muito menor; curva mais alta para integrações de pagamento. |
| **Rails** | Convenção ajuda, mas tipagem e PWA offline ficam mais penosas. |

## Consequências

- Monorepo TS com pacotes compartilhados; ganhos de produtividade e
  consistência.
- Precisamos disciplina para evitar "qualquer coisa em Node" (ex.:
  cálculos financeiros sem `Decimal`).
- Observabilidade e performance precisam ser desenhadas desde cedo
  (Node tem suas armadilhas em CPU-bound).
- Portugal/Brasil-friendly libs: `focus-nfe`, `ofx-js`, etc. Usaremos
  conforme ADR seguinte.

## Notas

Esta escolha pode ser revisitada quando algum domínio justificar
isolamento em outra linguagem (ex.: serviço de cálculo pesado).
Nesse caso, um ADR novo documentará a extração.
