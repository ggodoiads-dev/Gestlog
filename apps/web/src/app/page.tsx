import Link from 'next/link';

import { Badge, Button, DemoBanner } from '@gestlog/ui';

export default function Home(): JSX.Element {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-6 py-16">
      <header className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs tracking-wider text-ink-500">GESTLOG · v0.0.0</span>
          <Badge tone="warning">dia 0 · pré-release</Badge>
        </div>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-ink-900 dark:text-white">
          Sua transportadora sob controle.
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-ink-700 dark:text-white/80">
          ERP SaaS multi-tenant para transportadoras brasileiras de fretamento corporativo. O
          coração do produto é o <strong>Rotagrama</strong> — rotas, turnos, motoristas e
          veículos sob torre de controle. A camada financeira existe para sustentar essa
          operação com previsibilidade.
        </p>
      </header>

      <DemoBanner
        module="Plataforma inteira"
        reason="Repositório em construção. Nenhum dado real, nenhuma integração homologada. Este é o scaffold inicial — veja docs/IMPLEMENTATION_STATUS.md."
      />

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-card border border-surface-200 bg-surface-card p-6 shadow-sm dark:border-navy-700 dark:bg-navy-900">
          <h2 className="text-lg font-semibold text-ink-900 dark:text-white">
            Contrato de produto
          </h2>
          <p className="mt-2 text-sm text-ink-700 dark:text-white/80">
            Antes do código, a documentação define o que será construído, o que está decidido e
            o que ainda precisa validação. Leia primeiro.
          </p>
          <div className="mt-4 flex gap-2">
            <Link
              href="https://github.com/ggodoiads-dev/gestlog/tree/claude/sweet-cray-mmitsi/docs"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-control border border-surface-200 bg-surface-card px-4 text-sm font-medium text-ink-900 transition-colors hover:bg-surface-100 focus-visible:outline-accent dark:border-navy-700 dark:bg-navy-800 dark:text-white dark:hover:bg-navy-700"
            >
              Documentação
            </Link>
          </div>
        </article>

        <article className="rounded-card border border-surface-200 bg-surface-card p-6 shadow-sm dark:border-navy-700 dark:bg-navy-900">
          <h2 className="text-lg font-semibold text-ink-900 dark:text-white">Próximos alvos</h2>
          <ul className="mt-2 space-y-1 text-sm text-ink-700 dark:text-white/80">
            <li>• Módulo <code>core</code> (tenant, users, roles, auditoria)</li>
            <li>• Módulo <code>routing</code> — Rotagrama como tela assinatura</li>
            <li>• Módulo <code>fleet</code> + elegibilidade consolidada</li>
            <li>• Módulo <code>operations</code> + driver app</li>
            <li>• Camada financeira (medição → faturamento → AR → DRE/EBITDA)</li>
          </ul>
        </article>
      </section>

      <footer className="mt-auto flex items-center justify-between border-t border-surface-200 pt-6 text-xs text-ink-500 dark:border-navy-700">
        <span>© 2026 GESTLOG — proprietary.</span>
        <span className="font-mono">build dia 0</span>
      </footer>
    </main>
  );
}
