import { redirect } from 'next/navigation';

import { Badge } from '@gestlog/ui';

import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { formatIsoDate } from '@/lib/format';
import { getSession } from '@/lib/session';

interface DriverRow {
  id: string;
  fullName: string;
  cpf: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
  currentLicense: {
    category: string;
    number: string;
    validUntil: string;
  } | null;
}

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  TERMINATED: 'neutral',
};

function formatCpf(cpf: string): string {
  const d = cpf.replace(/\D/g, '').padStart(11, '0');
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function cnhStatus(validUntil: string): {
  tone: 'success' | 'warning' | 'danger';
  label: string;
} {
  const d = new Date(validUntil);
  const now = new Date();
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { tone: 'danger', label: `vencida há ${-diffDays}d` };
  if (diffDays <= 60) return { tone: 'warning', label: `vence em ${diffDays}d` };
  return { tone: 'success', label: `vence em ${diffDays}d` };
}

export default async function MotoristasPage(): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect('/login');

  const [{ items }, me] = await Promise.all([
    apiFetch<{ items: DriverRow[] }>('/v1/drivers'),
    apiFetch<{ tenant: { name: string } }>('/v1/me'),
  ]);

  const active = items.filter((d) => d.status === 'ACTIVE').length;
  const expired = items.filter((d) => {
    if (!d.currentLicense) return true;
    return new Date(d.currentLicense.validUntil).getTime() < Date.now();
  }).length;
  const near = items.filter((d) => {
    if (!d.currentLicense) return false;
    const diff =
      (new Date(d.currentLicense.validUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 60;
  }).length;

  return (
    <AppShell session={session} tenantName={me.tenant.name} activePath="/motoristas">
      <div className="space-y-6">
        <header>
          <span className="text-xs font-medium uppercase tracking-widest text-ink-500">
            Pessoas
          </span>
          <h1 className="mt-1 text-2xl font-semibold text-ink-900 dark:text-white">
            Motoristas
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-700 dark:text-white/70">
            Identidade única por CPF. A habilitação vigente aqui é a mesma consultada pelo
            AutoDispatch no momento da designação — sem fontes paralelas.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Total
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-ink-900 tabular-nums dark:text-white">
              {items.length}
            </div>
          </article>
          <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Ativos
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-success-600 tabular-nums">
              {active}
            </div>
          </article>
          <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              CNH vencendo (60d)
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-warning-600 tabular-nums">
              {near}
            </div>
            <div className="mt-1 text-xs text-ink-500">ação proativa recomendada</div>
          </article>
          <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              CNH vencida / ausente
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-danger-600 tabular-nums">
              {expired}
            </div>
            <div className="mt-1 text-xs text-ink-500">bloqueio imediato no despacho</div>
          </article>
        </section>

        {items.length === 0 ? (
          <div className="rounded-card border border-dashed border-surface-200 p-8 text-center text-sm text-ink-500 dark:border-navy-700">
            Nenhum motorista cadastrado.
          </div>
        ) : (
          <div className="overflow-hidden rounded-card border border-surface-200 bg-surface-card shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 text-left text-[11px] uppercase tracking-wider text-ink-500 dark:border-navy-700">
                  <th className="px-4 py-2.5">Nome</th>
                  <th className="px-4 py-2.5">CPF</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Categoria CNH</th>
                  <th className="px-4 py-2.5">Número</th>
                  <th className="px-4 py-2.5">Validade</th>
                  <th className="px-4 py-2.5">Em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-200 dark:divide-navy-700">
                {items.map((d) => {
                  const cnh = d.currentLicense;
                  const timing = cnh ? cnhStatus(cnh.validUntil) : null;
                  return (
                    <tr key={d.id} className="hover:bg-surface-100/50 dark:hover:bg-navy-800/50">
                      <td className="px-4 py-2.5 text-ink-900 dark:text-white">{d.fullName}</td>
                      <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-ink-500">
                        {formatCpf(d.cpf)}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={STATUS_TONE[d.status] ?? 'neutral'}>
                          {d.status.toLowerCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-ink-900 dark:text-white">
                        {cnh?.category ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[10px] text-ink-500">
                        {cnh?.number ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-ink-700 dark:text-white/90">
                        {cnh ? formatIsoDate(cnh.validUntil) : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        {timing ? (
                          <Badge tone={timing.tone}>{timing.label}</Badge>
                        ) : (
                          <Badge tone="danger">sem CNH</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
