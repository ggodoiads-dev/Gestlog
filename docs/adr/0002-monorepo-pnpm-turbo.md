# ADR-0002: Monorepo com pnpm + Turborepo

Status: Accepted
Date: 2026-11-09

## Contexto

Precisamos compartilhar **tipos**, **Zod schemas**, **Money/VOs**,
**design system** e **cliente OpenAPI** entre três apps (api, web,
driver) e múltiplos packages de domínio. Instalações independentes
em três projetos NPM separados levariam a divergências de versão
e duplicação de código.

## Decisão

Adotar **pnpm workspaces** para gestão de dependências e
**Turborepo** para orquestração de tarefas (build, lint, test,
typecheck) com cache local (e remoto quando disponível em CI).

### Layout

```
apps/{api,web,driver}
packages/{db,domain,shared,ui,config}
```

- `packages/config` centraliza tsconfig base, ESLint, Prettier,
  Tailwind preset.
- `packages/shared` concentra Zod, Money, value objects, tipos
  comuns.
- `packages/domain` contém o núcleo de cada bounded context, puro TS.
- `packages/ui` contém o design system (tokens + componentes).
- `packages/db` contém schema Prisma + migrations + seeds.

### Pipelines Turbo

- `pnpm lint` roda ESLint com cache.
- `pnpm typecheck` roda `tsc --noEmit` incremental.
- `pnpm test` roda Vitest com cache por pacote.
- `pnpm build` compila `packages/*` antes de `apps/*`.

## Alternativas consideradas

| Alternativa | Por que não |
|-------------|-------------|
| npm workspaces | Mais lento, sem recursos fine-grained do pnpm; instalação pesada. |
| Yarn 4 + Nx | Nx é poderoso mas mais caro de aprender; Turbo é suficiente. |
| Multirepo | Cria atrito e divergência de tipos; não serve ao tamanho do produto. |

## Consequências

- Primeiro `pnpm install` baixa menos (pnpm compartilha store); CI
  mais rápido.
- Turbo exige `turbo.json` bem definido; tarefas devem declarar
  `outputs` para cache funcionar.
- Scripts de root precisam convenção clara (`pnpm --filter`).

## Notas

Quando o produto tiver mais de 15 pacotes ou precisar de
remote caching em escala, avaliar Nx Cloud ou Vercel Turbo Remote
Cache. Por ora, cache local é suficiente.
