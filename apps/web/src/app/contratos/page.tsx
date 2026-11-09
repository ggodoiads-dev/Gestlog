import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Badge } from '@gestlog/ui';

import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { formatCents, formatIsoDate } from '@/lib/format';
import { getSession } from '@/lib/session';

interface ContractRow {
  id: string;
  code: string;
  title: string;
  status: string;
  clientId: string;
  clientName: string;
  pricingMode: 'MONTHLY_FIXED' | 'PER_TRIP' | null;
  pricingAmountCents: string | null;
  pricingCurrency: string;
  startDate: string | null;
}

export default async function ContratosPage(): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect('/login');

  const [{ items }, me] = await Promise.all([
    apiFetch<{ items: ContractRow[] }>('/v1/contracts'),
    apiFetch<{ tenant: { name: string } }>('/v1/me'),
  ]);

  return (
    <AppShell session={session} tenantName={me.tenant.name} activePath="/contratos">
      <div className="space-y-6">
        <header>
          <span className="text-xs font-medium uppercase tracking-widest text-ink-500">
            Comercial
          </span>
          <h1 className="mt-1 text-2xl font-semibold text-ink-900 dark:text-white">Contratos</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-700 dark:text-white/70">
            Contratos ativos e seu preço vigente. Clique para emitir pré-fatura de uma
            competência.
          </p>
        </header>

        <div className="overflow-hidden rounded-card border border-surface-200 bg-surface-card shadow-sm dark:border-navy-700 dark:bg-navy-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 text-left text-[11px] uppercase tracking-wider text-ink-500 dark:border-navy-700">
                <th className="px-4 py-2.5">Código</th>
                <th className="px-4 py-2.5">Título</th>
                <th className="px-4 py-2.5">Cliente</th>
                <th className="px-4 py-2.5">Modelo</th>
                <th className="px-4 py-2.5 text-right">Valor vigente</th>
                <th className="px-4 py-2.5">Início</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-200 dark:divide-navy-700">
              {items.map((c) => (
                <tr key={c.id} className="hover:bg-surface-100/50 dark:hover:bg-navy-800/50">
                  <td className="px-4 py-2.5 font-mono text-xs text-ink-900 dark:text-white">
                    {c.code}
                  </td>
                  <td className="px-4 py-2.5 text-ink-700 dark:text-white/90">{c.title}</td>
                  <td className="px-4 py-2.5 text-ink-700 dark:text-white/90">{c.clientName}</td>
                  <td className="px-4 py-2.5 text-xs text-ink-500">
                    {c.pricingMode === 'MONTHLY_FIXED'
                      ? 'mensal fixo'
                      : c.pricingMode === 'PER_TRIP'
                        ? 'por viagem'
                        : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-900 dark:text-white">
                    {formatCents(c.pricingAmountCents, c.pricingCurrency)}
                    {c.pricingMode === 'PER_TRIP' ? (
                      <span className="ml-1 text-xs text-ink-500">/ viagem</span>
                    ) : c.pricingMode === 'MONTHLY_FIXED' ? (
                      <span className="ml-1 text-xs text-ink-500">/ mês</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-ink-500">
                    {formatIsoDate(c.startDate)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={c.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      {c.status.toLowerCase().replace('_', ' ')}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/contratos/${c.id}`}
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      abrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
