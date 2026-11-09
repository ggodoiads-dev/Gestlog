# @gestlog/web — Admin / Operação / Financeiro

Next.js 15 (App Router) + React 19 + Tailwind 4 + componentes do
`@gestlog/ui`. O design system segue `docs/DESIGN_SYSTEM.md`.

## Estado atual

Tela inicial de scaffold, com banner de modo demo. O rotagrama é o
alvo prioritário: será a tela assinatura do produto.

## Convenções

- Server Components por padrão; Client Components só quando interação
  ou estado local for necessário.
- `@tanstack/react-query` para estado de servidor; `@tanstack/react-table`
  para grids densas.
- Nenhum componente consome valores monetários como `number` — sempre
  `MoneyDto` (ver `@gestlog/shared`).
- `data-theme` em `<html>` controla claro/escuro; preferência do usuário
  persistida no servidor.
