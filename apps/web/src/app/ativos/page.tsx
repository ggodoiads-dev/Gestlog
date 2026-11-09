import { redirect } from 'next/navigation';

import { Badge } from '@gestlog/ui';

import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { formatCents } from '@/lib/format';
import { getSession } from '@/lib/session';

interface Asset {
  id: string;
  code: string;
  name: string;
  category: string;
  status: 'ACTIVE' | 'DISPOSED' | 'WRITE_OFF';
  acquisitionCostCents: string;
  accumulatedDepreciationCents: string;
  netBookValueCents: string;
  hasActiveFinancing: boolean;
}

const CATEGORY_LABEL: Record<string, string> = {
  VEHICLE: 'Veículo',
  EQUIPMENT: 'Equipamento',
  IT_HARDWARE: 'Hardware TI',
  REAL_ESTATE: 'Imóvel',
  FURNITURE: 'Mobiliário',
  OTHER: 'Outro',
};

const STATUS_TONE: Record<string, 'success' | 'neutral' | 'danger'> = {
  ACTIVE: 'success',
  DISPOSED: 'neutral',
  WRITE_OFF: 'danger',
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'ativo',
  DISPOSED: 'baixado',
  WRITE_OFF: 'write-off',
};

export default async function AtivosPage(): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect('/login');

  const [{ items }, me] = await Promise.all([
    apiFetch<{ items: Asset[] }>('/v1/assets'),
    apiFetch<{ tenant: { name: string } }>('/v1/me'),
  ]);

  const totalCost = items.reduce((s, a) => s + BigInt(a.acquisitionCostCents), 0n);
  const totalDepreciation = items.reduce(
    (s, a) => s + BigInt(a.accumulatedDepreciationCents),
    0n,
  );
  const totalNetBook = items.reduce((s, a) => s + BigInt(a.netBookValueCents), 0n);
  const active = items.filter((a) => a.status === 'ACTIVE').length;
  const financed = items.filter((a) => a.hasActiveFinancing).length;

  return (
    <AppShell session={session} tenantName={me.tenant.name} activePath="/ativos">
      <div className="space-y-6">
        <header>
          <span className="text-xs font-medium uppercase tracking-widest text-ink-500">
            Financeiro
          </span>
          <h1 className="mt-1 text-2xl font-semibold text-ink-900 dark:text-white">
            Ativo imobilizado
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-700 dark:text-white/70">
            Ativos capitalizados, depreciação linha-reta e financiamento. CAPEX não
            entra em EBITDA (AT-29/AT-32); revisão de vida útil altera só meses
            futuros (AT-31); baixar ativo financiado exige consentimento do credor
            (AT-30).
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Ativos
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-ink-900 tabular-nums dark:text-white">
              {items.length}
            </div>
            <div className="mt-1 text-xs text-ink-500">{active} ativos · {items.length - active} baixados</div>
          </article>
          <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Custo original
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-ink-900 tabular-nums dark:text-white">
              {formatCents(totalCost.toString(), 'BRL')}
            </div>
          </article>
          <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Depreciação acumulada
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-warning-600 tabular-nums">
              {formatCents(totalDepreciation.toString(), 'BRL')}
            </div>
          </article>
          <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Valor contábil líquido
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-success-600 tabular-nums">
              {formatCents(totalNetBook.toString(), 'BRL')}
            </div>
            <div className="mt-1 text-xs text-ink-500">{financed} com financiamento ativo</div>
          </article>
        </section>

        {items.length === 0 ? (
          <div className="rounded-card border border-dashed border-surface-200 p-8 text-center text-sm text-ink-500 dark:border-navy-700">
            Nenhum ativo cadastrado. Use <code>POST /v1/assets</code>.
          </div>
        ) : (
          <div className="overflow-hidden rounded-card border border-surface-200 bg-surface-card shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 text-left text-[11px] uppercase tracking-wider text-ink-500 dark:border-navy-700">
                  <th className="px-4 py-2.5">Código</th>
                  <th className="px-4 py-2.5">Nome</th>
                  <th className="px-4 py-2.5">Categoria</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Custo</th>
                  <th className="px-4 py-2.5 text-right">Depreciação</th>
                  <th className="px-4 py-2.5 text-right">Líquido</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-200 dark:divide-navy-700">
                {items.map((a) => (
                  <tr key={a.id} className="hover:bg-surface-100/50 dark:hover:bg-navy-800/50">
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-900 dark:text-white">
                      {a.code}
                    </td>
                    <td className="px-4 py-2.5 text-ink-700 dark:text-white/90">{a.name}</td>
                    <td className="px-4 py-2.5 text-xs text-ink-500">
                      {CATEGORY_LABEL[a.category] ?? a.category}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={STATUS_TONE[a.status] ?? 'neutral'}>
                        {STATUS_LABEL[a.status] ?? a.status.toLowerCase()}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-700 dark:text-white/90">
                      {formatCents(a.acquisitionCostCents, 'BRL')}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-warning-600">
                      {formatCents(a.accumulatedDepreciationCents, 'BRL')}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-900 dark:text-white">
                      {formatCents(a.netBookValueCents, 'BRL')}
                    </td>
                    <td className="px-4 py-2.5">
                      {a.hasActiveFinancing ? (
                        <Badge tone="info">financiado</Badge>
                      ) : null}
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
