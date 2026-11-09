import { redirect } from 'next/navigation';

import { Badge } from '@gestlog/ui';

import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { formatCents, formatCompetence, formatIsoDate } from '@/lib/format';
import { getSession, hasPermission } from '@/lib/session';
import { PeriodActions } from './period-actions';

interface ContractRow {
  id: string;
  legalEntityId: string;
  clientName: string;
}

interface DreResponse {
  legalEntityId: string;
  year: number;
  month: number;
  currency: string;
  revenueCents: string;
  opexCents: string;
  ebitdaCents: string;
  marginBps: number;
  period: {
    id: string | null;
    state: 'OPEN' | 'CLOSING' | 'CLOSED' | 'REOPENED';
    closedAt: string | null;
    reopenedAt: string | null;
    reopenReason: string | null;
  };
  snapshots: {
    version: number;
    computedAt: string;
    revenueCents: string;
    opexCents: string;
    ebitdaCents: string;
    marginBps: number;
  }[];
  source: 'live' | 'snapshot';
}

const STATE_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  OPEN: 'info',
  CLOSING: 'warning',
  CLOSED: 'success',
  REOPENED: 'warning',
};

function defaultCompetence(): { year: number; month: number } {
  const d = new Date();
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

function formatBps(bps: number): string {
  // 100 bps = 1%. Com 1 casa decimal.
  return `${(bps / 100).toFixed(1)}%`;
}

export default async function DrePage({
  searchParams,
}: {
  searchParams: Promise<{ legalEntityId?: string; year?: string; month?: string }>;
}): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect('/login');
  const sp = await searchParams;

  // Precisamos descobrir quais legal entities o tenant tem. Contratos
  // carregam legalEntityId; isso basta para o seletor desta fatia.
  const [{ items: contracts }, me] = await Promise.all([
    apiFetch<{ items: ContractRow[] }>('/v1/contracts'),
    apiFetch<{ tenant: { name: string } }>('/v1/me'),
  ]);

  // Agrupa legal entities únicos a partir dos contratos.
  const legalEntityIds = Array.from(new Set(contracts.map((c) => c.legalEntityId)));

  const def = defaultCompetence();
  const selectedLE = sp.legalEntityId ?? legalEntityIds[0];
  const year = sp.year ? Number.parseInt(sp.year, 10) : def.year;
  const month = sp.month ? Number.parseInt(sp.month, 10) : def.month;

  let dre: DreResponse | null = null;
  let dreError: string | null = null;
  if (selectedLE) {
    try {
      dre = await apiFetch<DreResponse>(
        `/v1/finance/dre?legalEntityId=${selectedLE}&year=${year}&month=${month}`,
      );
    } catch (err) {
      dreError = err instanceof Error ? err.message : 'falha ao carregar DRE';
    }
  }

  const canClose = hasPermission(session, 'finance.periods.close');
  const canReopen = hasPermission(session, 'finance.periods.reopen');

  return (
    <AppShell session={session} tenantName={me.tenant.name} activePath="/dre">
      <div className="space-y-6">
        <header>
          <span className="text-xs font-medium uppercase tracking-widest text-ink-500">
            Financeiro
          </span>
          <h1 className="mt-1 text-2xl font-semibold text-ink-900 dark:text-white">
            DRE / EBITDA
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-700 dark:text-white/70">
            Fechamento mensal com snapshot imutável. Receita vem do livro de medição
            contratual; opex vem das contas a pagar da competência. Reabertura preserva
            histórico.
          </p>
        </header>

        <form className="flex flex-wrap items-end gap-3 rounded-card border border-surface-200 bg-surface-card p-4 shadow-sm dark:border-navy-700 dark:bg-navy-900">
          <div>
            <label htmlFor="legalEntityId" className="text-[11px] text-ink-500">
              Pessoa jurídica
            </label>
            <select
              id="legalEntityId"
              name="legalEntityId"
              defaultValue={selectedLE ?? ''}
              className="h-9 min-w-[260px] rounded-control border border-surface-200 bg-surface-0 px-2 font-mono text-xs dark:border-navy-700 dark:bg-navy-800 dark:text-white"
            >
              {legalEntityIds.map((id) => (
                <option key={id} value={id}>
                  {id.slice(0, 8)}…
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="year" className="text-[11px] text-ink-500">
              Ano
            </label>
            <input
              id="year"
              name="year"
              type="number"
              min="2000"
              max="2100"
              defaultValue={year}
              className="h-9 w-24 rounded-control border border-surface-200 bg-surface-0 px-2 font-mono tabular-nums dark:border-navy-700 dark:bg-navy-800 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor="month" className="text-[11px] text-ink-500">
              Mês
            </label>
            <select
              id="month"
              name="month"
              defaultValue={month}
              className="h-9 rounded-control border border-surface-200 bg-surface-0 px-2 dark:border-navy-700 dark:bg-navy-800 dark:text-white"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {String(m).padStart(2, '0')}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="h-9 rounded-control bg-accent px-3 text-xs font-medium text-white hover:bg-accent-hover"
          >
            aplicar
          </button>
        </form>

        {dreError ? (
          <div className="rounded-card border border-danger-600/40 bg-danger-600/5 px-4 py-3 text-sm text-danger-600">
            {dreError}
          </div>
        ) : !dre ? (
          <div className="rounded-card border border-dashed border-surface-200 p-6 text-sm text-ink-500 dark:border-navy-700">
            Selecione uma pessoa jurídica.
          </div>
        ) : (
          <>
            <section className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Badge tone={STATE_TONE[dre.period.state] ?? 'neutral'}>
                  {dre.period.state.toLowerCase()}
                </Badge>
                <span className="text-xs text-ink-500">
                  {formatCompetence(`${dre.year}-${String(dre.month).padStart(2, '0')}`)} ·{' '}
                  {dre.source === 'snapshot' ? 'snapshot imutável' : 'cálculo ao vivo'}
                  {dre.period.closedAt
                    ? ` · fechada em ${formatIsoDate(dre.period.closedAt)}`
                    : ''}
                  {dre.period.reopenedAt
                    ? ` · reaberta em ${formatIsoDate(dre.period.reopenedAt)}`
                    : ''}
                </span>
              </div>
              {selectedLE && (canClose || canReopen) ? (
                <PeriodActions
                  legalEntityId={selectedLE}
                  year={dre.year}
                  month={dre.month}
                  state={dre.period.state}
                  canClose={canClose}
                  canReopen={canReopen}
                />
              ) : null}
            </section>

            <section className="grid gap-4 md:grid-cols-4">
              <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
                <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
                  Receita
                </div>
                <div className="mt-2 font-mono text-2xl font-semibold text-ink-900 tabular-nums dark:text-white">
                  {formatCents(dre.revenueCents, dre.currency)}
                </div>
                <div className="mt-1 text-xs text-ink-500">livro de medição contratual</div>
              </article>
              <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
                <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
                  Opex
                </div>
                <div className="mt-2 font-mono text-2xl font-semibold text-ink-900 tabular-nums dark:text-white">
                  {formatCents(dre.opexCents, dre.currency)}
                </div>
                <div className="mt-1 text-xs text-ink-500">contas a pagar da competência</div>
              </article>
              <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
                <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
                  EBITDA
                </div>
                <div
                  className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
                    BigInt(dre.ebitdaCents) >= 0n
                      ? 'text-success-600'
                      : 'text-danger-600'
                  }`}
                >
                  {formatCents(dre.ebitdaCents, dre.currency)}
                </div>
                <div className="mt-1 text-xs text-ink-500">receita − opex (acima da depreciação)</div>
              </article>
              <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
                <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
                  Margem EBITDA
                </div>
                <div className="mt-2 font-mono text-2xl font-semibold text-ink-900 tabular-nums dark:text-white">
                  {formatBps(dre.marginBps)}
                </div>
                <div className="mt-1 text-xs text-ink-500">basis points: {dre.marginBps}</div>
              </article>
            </section>

            {dre.snapshots.length > 0 ? (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
                  Histórico de snapshots (imutáveis)
                </h2>
                <div className="overflow-hidden rounded-card border border-surface-200 bg-surface-card shadow-sm dark:border-navy-700 dark:bg-navy-900">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-200 text-left text-[11px] uppercase tracking-wider text-ink-500 dark:border-navy-700">
                        <th className="px-4 py-2.5">Versão</th>
                        <th className="px-4 py-2.5">Computado em</th>
                        <th className="px-4 py-2.5 text-right">Receita</th>
                        <th className="px-4 py-2.5 text-right">Opex</th>
                        <th className="px-4 py-2.5 text-right">EBITDA</th>
                        <th className="px-4 py-2.5 text-right">Margem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-200 dark:divide-navy-700">
                      {dre.snapshots.map((s) => (
                        <tr key={s.version}>
                          <td className="px-4 py-2.5 font-mono text-xs text-ink-900 dark:text-white">
                            v{s.version}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-ink-500">
                            {formatIsoDate(s.computedAt)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-700 dark:text-white/90">
                            {formatCents(s.revenueCents, dre.currency)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-700 dark:text-white/90">
                            {formatCents(s.opexCents, dre.currency)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-900 dark:text-white">
                            {formatCents(s.ebitdaCents, dre.currency)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-ink-500">
                            {formatBps(s.marginBps)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {dre.period.reopenReason ? (
              <section className="rounded-card border border-warning-600/40 bg-warning-600/5 px-4 py-3 text-xs text-warning-600">
                <strong>Motivo da reabertura:</strong> {dre.period.reopenReason}
              </section>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}
