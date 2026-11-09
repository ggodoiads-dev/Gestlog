# Design System — GESTLOG

> Sensação alvo: **precision enterprise / premium operational intelligence**.
> Não é dashboard colorido, não é painel de criptomoedas, não é planilha
> enfeitada. É uma torre de controle séria, com densidade onde precisa e
> respiro onde importa.

## 1. Tokens — paleta base (proposta, substituível por marca oficial)

| Token | Valor | Uso |
|-------|-------|-----|
| `--color-navy-950` | `#0A1420` | Fundo mais profundo (modo escuro, superfícies de autoridade) |
| `--color-navy-900` | `#101D30` | Fundo primário do modo escuro / chrome |
| `--color-navy-800` | `#172D49` | Barra lateral modo escuro, headers executivos |
| `--color-navy-700` | `#1F3A5F` | Superfície elevada modo escuro |
| `--color-ink-900` | `#0F172A` | Texto primário modo claro |
| `--color-ink-700` | `#334155` | Texto secundário modo claro |
| `--color-ink-500` | `#64748B` | Texto terciário, placeholders |
| `--color-surface-0` | `#FFFFFF` | Papel modo claro |
| `--color-surface-50` | `#F6F8FC` | Fundo app modo claro |
| `--color-surface-100` | `#EEF2F8` | Linhas zebra, chips |
| `--color-surface-200` | `#DBE3EF` | Bordas sutis |
| `--color-accent-600` | `#3278D3` | Ação primária, link, foco |
| `--color-accent-500` | `#4A8FE0` | Hover de ação primária |
| `--color-accent-300` | `#8EB9EE` | Destaque leve |
| `--color-success-600` | `#15803D` | Confirmação, estado saudável |
| `--color-warning-600` | `#B45309` | Atenção, requer revisão |
| `--color-danger-600` | `#B91C1C` | Erro, risco, bloqueio |
| `--color-info-600` | `#0369A1` | Informação técnica |

Estados **nunca** dependem exclusivamente de cor — sempre acompanham
ícone + rótulo ou padrão.

## 2. Tipografia

- **Família primária:** Inter (variable), com fallback para
  `-apple-system, system-ui, sans-serif`.
- **Família monospace:** JetBrains Mono (para IDs técnicos, códigos).
- **Numerais:** `font-variant-numeric: tabular-nums` **sempre** em
  tabelas financeiras e grids operacionais.
- Escala (modo claro):

| Token | Tamanho / linha | Uso |
|-------|-----------------|-----|
| `text-display` | 32 / 40 | Hero discreto (login, home executiva) |
| `text-title-xl` | 24 / 32 | Título de página |
| `text-title` | 20 / 28 | Título de seção |
| `text-subtitle` | 16 / 24, semibold | Subtítulo, header de card |
| `text-body` | 14 / 20 | Corpo |
| `text-body-sm` | 13 / 18 | Corpo denso, tabela |
| `text-caption` | 12 / 16 | Legenda, metadados, frescor |
| `text-mono-sm` | 12 / 16 mono | IDs, códigos, placas |

## 3. Grid, espaçamento, bordas

- Grid base 4 px; espaçamentos: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 56 / 72.
- Border radius: 6 (controles), 10 (cards), 14 (modais), 999 (chip/pill).
- Sombras: 3 níveis (`sm`, `md`, `lg`), muito sutis no modo claro;
  no modo escuro usam bordas elevadas em vez de sombras pesadas.

## 4. Modo claro é o padrão. Modo escuro é desenhado.

- No modo escuro, trocamos **superfícies**, não apenas invertemos
  cores. Um chart continua acessível, um tipo tabular continua legível.
- Usuário define a preferência; sistema respeita `prefers-color-scheme`
  no primeiro acesso.

## 5. Componentes-chave

Listados em ordem de centralidade no produto:

1. **AppShell** — barra lateral recolhível + topo contextual
   (empresa/garagem/período) + busca global + centro de notificações +
   ações pendentes. Breadcrumbs sempre que a página for subordinada.
2. **DataTable** — densa, com filtros por coluna, ordenação, paginação,
   virtualização quando >200 linhas, colunas configuráveis por usuário
   (persistido no servidor), ações contextuais, export autorizado.
3. **Drawer** — para inspeção rápida sem perder contexto.
4. **FullPage** — para processos complexos (aprovações, fechamento,
   simulações). Modal só para confirmações.
5. **StateBadge** — chip que sempre carrega ícone + rótulo +
   `title`/`aria-label`.
6. **MetricCard** — exibe: valor + unidade + rótulo + **fonte** +
   **competência / frescor** + delta vs período + drill-down.
7. **Timeline** — ficha de veículo, contrato, pedido, pagamento. Cada
   evento tem autor, origem e badge de verificação.
8. **MoneyField / MoneyCell** — BRL pt-BR, tabular, com `title` mostrando
   origem contábil.
9. **ApprovalContextCard** — contexto completo do pedido (objeto, valor,
   fornecedor, orçamento, risco, impedimentos). Nunca aprovar sem.
10. **EmptyState** — nunca inerte: sempre sugere próxima ação e explica
    por que está vazio.
11. **OfflineBanner** (driver app) — transparente sobre estado da fila.
12. **AuditEventList** — before/after em diff legível, com link para
    evento correlato.

## 6. Acessibilidade

- Contraste mínimo WCAG AA; AAA preferido para texto de interface.
- Foco visível em todos os controles (`:focus-visible`), com anel
  distinguível em claro e escuro.
- Navegação por teclado completa em todas as telas administrativas.
- `prefers-reduced-motion` desliga transições não essenciais.
- Mensagens de erro ligadas por `aria-describedby`.

## 7. Movimento

- Transições curtas (120–200 ms) para troca de estado, drawer, toast.
- Nenhum spinner cosmético: `skeleton` mostra forma dos dados.
- Zero animação que atrase decisão operacional.

## 8. Dados numéricos

- Sempre `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`
  com casa decimal apropriada ao contexto (financeiro: 2; operacional:
  variável por rubrica).
- Toda métrica mostra: **valor + unidade + competência + fonte + frescor**.
- "Última atualização: 09/11/2026 08:41 (manual)" vale mais que um
  gráfico bonito.

## 9. Tom de voz

- Direto, operacional, em português brasileiro.
- Erros sempre dizem **o que aconteceu + por que + próxima ação**.
- Sem gírias, sem exagero, sem emoji (exceto se o tenant configurar).

## 10. Áreas com sensação própria (dentro do mesmo sistema)

| Área | Sensação | Pistas visuais |
|------|----------|-----------------|
| Dashboard executivo | "Tenho a empresa nas mãos" | Hero discreto, densidade equilibrada, drill-down |
| Rotagrama / Central de Operações | "Torre de controle" | Matriz temporal + mapa útil + alertas priorizados |
| Ficha do veículo | "Confiabilidade técnica" | Timeline, badges de custódia e OS, documentos |
| Portal do Cliente | "Fornecedor profissional" | Interface própria, zero menu administrativo |
| App do Motorista | "Simples e difícil errar" | Botões grandes, poucas ações, offline claro |
| Aprovações | "Decisão consciente" | Contexto completo em uma tela, zero adivinhação |
| Finance / DRE / EBITDA | "Números confiáveis" | Origem + competência + versão em toda célula |

## 11. Implementação

- Tokens em `packages/ui/tokens.css` (CSS variables) + mapping para
  Tailwind 4 em `packages/ui/tailwind-preset.ts`.
- Componentes primitivos em `packages/ui/src/`.
- Estilo global do `apps/web` consome o preset.
- Driver app tem preset **reduzido** (botões maiores, contraste
  elevado, menos densidade).
