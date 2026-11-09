import { redirect } from 'next/navigation';

import { Badge } from '@gestlog/ui';

import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

interface ClientRow {
  id: string;
  legalName: string;
  tradeName: string | null;
  cnpj: string | null;
  status: string;
}

function formatCnpj(cnpj: string | null): string {
  if (!cnpj) return '—';
  const d = cnpj.replace(/\D/g, '').padStart(14, '0');
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export default async function ClientesPage(): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect('/login');

  const [{ items }, me] = await Promise.all([
    apiFetch<{ items: ClientRow[] }>('/v1/clients'),
    apiFetch<{ tenant: { name: string } }>('/v1/me'),
  ]);

  return (
    <AppShell session={session} tenantName={me.tenant.name} activePath="/clientes">
      <div className="space-y-6">
        <header>
          <span className="text-xs font-medium uppercase tracking-widest text-ink-500">
            Comercial
          </span>
          <h1 className="mt-1 text-2xl font-semibold text-ink-900 dark:text-white">Clientes</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-700 dark:text-white/70">
            Clientes corporativos atendidos. A visibilidade é escopada por tenant via RLS.
          </p>
        </header>

        {items.length === 0 ? (
          <div className="rounded-card border border-dashed border-surface-200 p-8 text-center text-sm text-ink-500 dark:border-navy-700">
            Nenhum cliente cadastrado.
          </div>
        ) : (
          <div className="overflow-hidden rounded-card border border-surface-200 bg-surface-card shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 text-left text-[11px] uppercase tracking-wider text-ink-500 dark:border-navy-700">
                  <th className="px-4 py-2.5">Razão social</th>
                  <th className="px-4 py-2.5">Nome fantasia</th>
                  <th className="px-4 py-2.5">CNPJ</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-200 dark:divide-navy-700">
                {items.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-100/50 dark:hover:bg-navy-800/50">
                    <td className="px-4 py-2.5 text-ink-900 dark:text-white">{c.legalName}</td>
                    <td className="px-4 py-2.5 text-ink-700 dark:text-white/90">
                      {c.tradeName ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-ink-500">
                      {formatCnpj(c.cnpj)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={c.status === 'ACTIVE' ? 'success' : 'neutral'}>
                        {c.status.toLowerCase()}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
