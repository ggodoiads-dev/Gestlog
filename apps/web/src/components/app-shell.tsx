import Link from 'next/link';

import { logoutAction } from '@/lib/auth-actions';
import type { Session } from '@/lib/session';

interface NavItem {
  label: string;
  href: string;
  permission?: string;
  soon?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  { label: 'Visão geral', items: [{ label: 'Dashboard', href: '/' }] },
  {
    label: 'Operações',
    items: [
      { label: 'Rotagrama', href: '/rotagrama', permission: 'routing.routes.read' },
      { label: 'Programação', href: '/programacao', permission: 'operations.trips.read' },
      { label: 'Viagens', href: '/viagens', permission: 'operations.trips.read', soon: true },
      { label: 'Designações', href: '/designacoes', permission: 'operations.trips.dispatch', soon: true },
    ],
  },
  {
    label: 'Frota',
    items: [
      { label: 'Veículos', href: '/veiculos', permission: 'fleet.vehicles.read' },
      { label: 'Manutenção', href: '/manutencao', soon: true },
      { label: 'Combustível', href: '/combustivel', soon: true },
    ],
  },
  {
    label: 'Pessoas',
    items: [
      { label: 'Motoristas', href: '/motoristas', permission: 'workforce.drivers.read' },
      { label: 'Escalas', href: '/escalas', soon: true },
    ],
  },
  {
    label: 'Comercial',
    items: [
      { label: 'Clientes', href: '/clientes', permission: 'clients.read' },
      { label: 'Contratos', href: '/contratos', permission: 'clm.contracts.read' },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { label: 'Recebíveis', href: '/recebiveis', permission: 'ar.receivables.read' },
      { label: 'Compras', href: '/compras', permission: 'procurement.orders.read' },
      { label: 'Pagamentos', href: '/pagamentos', permission: 'ap.payables.read' },
      { label: 'Tesouraria', href: '/tesouraria', soon: true },
      { label: 'DRE / EBITDA', href: '/dre', soon: true },
      { label: 'Orçamento', href: '/orcamento', soon: true },
    ],
  },
  {
    label: 'Governança',
    items: [
      { label: 'Aprovações', href: '/aprovacoes', permission: 'governance.approvals.read' },
      { label: 'Auditoria', href: '/auditoria', permission: 'core.audit.read', soon: true },
      { label: 'Configurações', href: '/configuracoes', soon: true },
    ],
  },
];

export function AppShell({
  session,
  tenantName,
  activePath,
  children,
}: {
  session: Session;
  tenantName: string;
  activePath: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="min-h-screen bg-surface-page">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-surface-200 bg-surface-card lg:flex dark:border-navy-700 dark:bg-navy-900">
          <div className="flex h-16 items-center gap-2 border-b border-surface-200 px-5 dark:border-navy-700">
            <span className="font-mono text-sm font-semibold tracking-widest text-ink-900 dark:text-white">
              GESTLOG
            </span>
            <span className="ml-auto rounded-full border border-warning-600/40 bg-warning-600/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-warning-600">
              demo
            </span>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            {NAV.map((group) => (
              <div key={group.label} className="mb-5">
                <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-ink-500">
                  {group.label}
                </div>
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const allowed =
                      !item.permission || session.permissions.includes(item.permission);
                    const active = activePath === item.href;
                    if (!allowed) return null;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.soon ? '#' : item.href}
                          aria-current={active ? 'page' : undefined}
                          aria-disabled={item.soon ? true : undefined}
                          className={[
                            'flex items-center justify-between rounded-control px-2.5 py-1.5 text-sm transition-colors',
                            active
                              ? 'bg-accent/10 text-accent'
                              : 'text-ink-700 hover:bg-surface-100 dark:text-white/80 dark:hover:bg-navy-800',
                            item.soon ? 'cursor-default opacity-60' : '',
                          ].join(' ')}
                        >
                          <span>{item.label}</span>
                          {item.soon ? (
                            <span className="rounded-full border border-surface-200 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-ink-500 dark:border-navy-700">
                              em breve
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center gap-4 border-b border-surface-200 bg-surface-card px-6 dark:border-navy-700 dark:bg-navy-900">
            <div className="flex min-w-0 items-center gap-2">
              <div className="truncate text-sm font-semibold text-ink-900 dark:text-white">
                {tenantName}
              </div>
              <span className="text-xs text-ink-500">· {session.roles.join(' · ')}</span>
            </div>
            <form action={logoutAction} className="ml-auto">
              <button
                type="submit"
                className="text-xs font-medium text-ink-700 hover:text-accent dark:text-white/80"
              >
                sair
              </button>
            </form>
          </header>
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
