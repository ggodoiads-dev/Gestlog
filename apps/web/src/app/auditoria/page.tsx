import { redirect } from 'next/navigation';

import { Badge } from '@gestlog/ui';

import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

interface AuditRow {
  id: string;
  action: string;
  subjectType: string;
  subjectId: string;
  subjectVersion: number | null;
  actorUserId: string | null;
  actor: { email: string; fullName: string } | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}

const ACTION_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent'> = {
  'finance.period.close': 'success',
  'finance.period.reopen': 'warning',
  'operations.assignment.propose': 'info',
  'operations.assignment.cancel': 'neutral',
  'governance.decide.approve': 'success',
  'governance.decide.reject': 'danger',
  'governance.decide.return': 'warning',
  'ap.payable.pay': 'accent' as never,
  'ap.payable.pay.fact': 'warning',
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'America/Sao_Paulo',
  });
}

function compactJson(v: unknown): string {
  if (v === null || v === undefined) return '—';
  try {
    const s = JSON.stringify(v);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  } catch {
    return '—';
  }
}

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{
    subjectType?: string;
    action?: string;
    from?: string;
    to?: string;
  }>;
}): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect('/login');
  const sp = await searchParams;

  const qs = new URLSearchParams();
  if (sp.subjectType) qs.set('subjectType', sp.subjectType);
  if (sp.action) qs.set('action', sp.action);
  if (sp.from) qs.set('from', sp.from);
  if (sp.to) qs.set('to', sp.to);
  qs.set('limit', '200');

  const [{ items }, me] = await Promise.all([
    apiFetch<{ items: AuditRow[] }>(`/v1/audit/events?${qs.toString()}`),
    apiFetch<{ tenant: { name: string } }>('/v1/me'),
  ]);

  const byAction = items.reduce<Record<string, number>>((acc, e) => {
    acc[e.action] = (acc[e.action] ?? 0) + 1;
    return acc;
  }, {});
  const actors = new Set(items.map((e) => e.actorUserId).filter(Boolean)).size;

  return (
    <AppShell session={session} tenantName={me.tenant.name} activePath="/auditoria">
      <div className="space-y-6">
        <header>
          <span className="text-xs font-medium uppercase tracking-widest text-ink-500">
            Governança
          </span>
          <h1 className="mt-1 text-2xl font-semibold text-ink-900 dark:text-white">
            Trilha de auditoria
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-700 dark:text-white/70">
            Append-only garantido no banco (AT-28): a role da aplicação só pode
            inserir, nunca alterar ou apagar. Qualquer tentativa gera{' '}
            <code className="rounded bg-surface-100 px-1 text-[11px] dark:bg-navy-800">
              permission denied
            </code>
            .
          </p>
        </header>

        <form className="flex flex-wrap items-end gap-3 rounded-card border border-surface-200 bg-surface-card p-4 shadow-sm dark:border-navy-700 dark:bg-navy-900">
          <div>
            <label htmlFor="subjectType" className="text-[11px] text-ink-500">
              Tipo de sujeito
            </label>
            <input
              id="subjectType"
              name="subjectType"
              defaultValue={sp.subjectType ?? ''}
              placeholder="ex.: AccountingPeriod"
              className="h-9 w-56 rounded-control border border-surface-200 bg-surface-0 px-2 text-xs dark:border-navy-700 dark:bg-navy-800 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor="action" className="text-[11px] text-ink-500">
              Ação
            </label>
            <input
              id="action"
              name="action"
              defaultValue={sp.action ?? ''}
              placeholder="ex.: finance.period.close"
              className="h-9 w-64 rounded-control border border-surface-200 bg-surface-0 px-2 text-xs dark:border-navy-700 dark:bg-navy-800 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor="from" className="text-[11px] text-ink-500">
              De
            </label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={sp.from ?? ''}
              className="h-9 rounded-control border border-surface-200 bg-surface-0 px-2 text-xs dark:border-navy-700 dark:bg-navy-800 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor="to" className="text-[11px] text-ink-500">
              Até
            </label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={sp.to ?? ''}
              className="h-9 rounded-control border border-surface-200 bg-surface-0 px-2 text-xs dark:border-navy-700 dark:bg-navy-800 dark:text-white"
            />
          </div>
          <button
            type="submit"
            className="h-9 rounded-control bg-accent px-3 text-xs font-medium text-white hover:bg-accent-hover"
          >
            filtrar
          </button>
        </form>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Eventos exibidos
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-ink-900 tabular-nums dark:text-white">
              {items.length}
            </div>
            <div className="mt-1 text-xs text-ink-500">limite 200 · ordenado por mais recente</div>
          </article>
          <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Atores distintos
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-ink-900 tabular-nums dark:text-white">
              {actors}
            </div>
          </article>
          <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Ações mais frequentes
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {Object.entries(byAction)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 4)
                .map(([action, n]) => (
                  <span
                    key={action}
                    className="rounded-full border border-surface-200 bg-surface-100 px-2 py-0.5 font-mono text-[10px] tabular-nums text-ink-700 dark:border-navy-700 dark:bg-navy-800 dark:text-white/80"
                  >
                    {action} · {n}
                  </span>
                ))}
            </div>
          </article>
        </section>

        {items.length === 0 ? (
          <div className="rounded-card border border-dashed border-surface-200 p-8 text-center text-sm text-ink-500 dark:border-navy-700">
            Nenhum evento no filtro atual.
          </div>
        ) : (
          <div className="overflow-hidden rounded-card border border-surface-200 bg-surface-card shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 text-left text-[11px] uppercase tracking-wider text-ink-500 dark:border-navy-700">
                  <th className="px-4 py-2.5">Quando</th>
                  <th className="px-4 py-2.5">Ator</th>
                  <th className="px-4 py-2.5">Ação</th>
                  <th className="px-4 py-2.5">Sujeito</th>
                  <th className="px-4 py-2.5">Ver</th>
                  <th className="px-4 py-2.5">Diff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-200 dark:divide-navy-700">
                {items.map((e) => (
                  <tr key={e.id} className="hover:bg-surface-100/50 dark:hover:bg-navy-800/50">
                    <td className="px-4 py-2.5 font-mono text-[10px] tabular-nums text-ink-500 whitespace-nowrap">
                      {formatDateTime(e.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-ink-700 dark:text-white/90">
                      {e.actor?.fullName ?? <span className="text-ink-500">sistema</span>}
                      {e.actor ? (
                        <div className="text-[10px] text-ink-500">{e.actor.email}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={ACTION_TONE[e.action] ?? 'neutral'}>
                        <span className="font-mono text-[10px]">{e.action}</span>
                      </Badge>
                      {e.reason ? (
                        <div className="mt-0.5 text-[10px] italic text-ink-500">
                          “{e.reason}”
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <div className="font-medium text-ink-900 dark:text-white">
                        {e.subjectType}
                      </div>
                      <div className="font-mono text-[10px] text-ink-500">
                        {e.subjectId.slice(0, 8)}…
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[10px] text-ink-500 tabular-nums">
                      {e.subjectVersion ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[10px] text-ink-500">
                      <div>
                        <span className="text-ink-500">antes: </span>
                        {compactJson(e.before)}
                      </div>
                      <div>
                        <span className="text-ink-500">após: </span>
                        {compactJson(e.after)}
                      </div>
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
