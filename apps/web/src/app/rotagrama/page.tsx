import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Badge } from '@gestlog/ui';

import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

interface RouteSummary {
  id: string;
  code: string;
  name: string;
  direction: 'IDA' | 'VOLTA' | 'ROUND_TRIP';
  status: string;
  activeVersion: { id: string; version: number; effectiveFrom: string } | null;
}

interface ScheduledTripRow {
  id: string;
  routeCode: string;
  routeVersion: number;
  turnLabel: string;
  plannedDeparture: string;
  plannedArrival: string;
  state: string;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

const STATE_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'accent' | 'danger'> = {
  PLANNED: 'neutral',
  ASSIGNED: 'accent',
  CONFIRMED: 'info',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  EXCEPTION: 'danger',
};

export default async function RotagramaPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect('/login');

  const sp = await searchParams;
  const date = sp.date ?? todayIso();

  const [{ items: routes }, me] = await Promise.all([
    apiFetch<{ items: RouteSummary[] }>('/v1/routes'),
    apiFetch<{ tenant: { name: string } }>('/v1/me'),
  ]);

  let trips: ScheduledTripRow[] = [];
  let tripsError: string | null = null;
  try {
    const res = await apiFetch<{ items: ScheduledTripRow[] }>(
      `/v1/scheduled-trips?date=${date}`,
    );
    trips = res.items;
  } catch (err) {
    tripsError = (err as Error).message;
  }

  return (
    <AppShell session={session} tenantName={me.tenant.name} activePath="/rotagrama">
      <div className="space-y-6">
        <header className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-widest text-ink-500">
            Operações
          </span>
          <h1 className="text-2xl font-semibold text-ink-900 dark:text-white">Rotagrama</h1>
          <p className="max-w-2xl text-sm text-ink-700 dark:text-white/70">
            Torre de controle das rotas corporativas. Versões publicadas são imutáveis —
            uma nova versão não reescreve viagens já executadas.
          </p>
        </header>

        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
              Rotas cadastradas
            </h2>
            <span className="text-xs text-ink-500">{routes.length} total</span>
          </div>
          {routes.length === 0 ? (
            <div className="rounded-card border border-dashed border-surface-200 p-8 text-center text-sm text-ink-500 dark:border-navy-700">
              Nenhuma rota cadastrada. Use <code>POST /v1/routes</code> para criar a primeira.
            </div>
          ) : (
            <div className="overflow-hidden rounded-card border border-surface-200 bg-surface-card shadow-sm dark:border-navy-700 dark:bg-navy-900">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 text-left text-[11px] uppercase tracking-wider text-ink-500 dark:border-navy-700">
                    <th className="px-4 py-2.5">Código</th>
                    <th className="px-4 py-2.5">Nome</th>
                    <th className="px-4 py-2.5">Sentido</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Versão vigente</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-200 dark:divide-navy-700">
                  {routes.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-100/50 dark:hover:bg-navy-800/50">
                      <td className="px-4 py-2.5 font-mono text-xs text-ink-900 dark:text-white">
                        {r.code}
                      </td>
                      <td className="px-4 py-2.5 text-ink-700 dark:text-white/90">{r.name}</td>
                      <td className="px-4 py-2.5 text-ink-500">{r.direction}</td>
                      <td className="px-4 py-2.5">
                        <Badge tone={r.status === 'ACTIVE' ? 'success' : 'neutral'}>
                          {r.status.toLowerCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-ink-700 dark:text-white/90">
                        {r.activeVersion ? (
                          <span className="font-mono text-xs">
                            v{r.activeVersion.version} · desde{' '}
                            {new Date(r.activeVersion.effectiveFrom).toLocaleDateString('pt-BR', {
                              timeZone: 'UTC',
                            })}
                          </span>
                        ) : (
                          <span className="text-ink-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link
                          href={`/rotagrama/${r.id}`}
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
          )}
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
                Grade do dia
              </h2>
              <p className="mt-1 text-xs text-ink-500">
                Cada viagem aponta para a versão de rota que a originou.
              </p>
            </div>
            <form className="flex items-center gap-2">
              <label htmlFor="date" className="text-xs text-ink-500">
                data
              </label>
              <input
                id="date"
                name="date"
                type="date"
                defaultValue={date}
                className="h-9 rounded-control border border-surface-200 bg-surface-0 px-2 text-sm dark:border-navy-700 dark:bg-navy-800 dark:text-white"
              />
              <button
                type="submit"
                className="h-9 rounded-control bg-accent px-3 text-xs font-medium text-white hover:bg-accent-hover"
              >
                aplicar
              </button>
            </form>
          </div>

          {tripsError ? (
            <div className="rounded-card border border-danger-600/40 bg-danger-600/5 px-4 py-3 text-sm text-danger-600">
              Falha ao carregar viagens: {tripsError}
            </div>
          ) : trips.length === 0 ? (
            <div className="rounded-card border border-dashed border-surface-200 p-8 text-center text-sm text-ink-500 dark:border-navy-700">
              Nenhuma viagem programada em{' '}
              {new Date(`${date}T00:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}.
              Expanda uma versão publicada para gerar viagens.
            </div>
          ) : (
            <div className="overflow-hidden rounded-card border border-surface-200 bg-surface-card shadow-sm dark:border-navy-700 dark:bg-navy-900">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 text-left text-[11px] uppercase tracking-wider text-ink-500 dark:border-navy-700">
                    <th className="px-4 py-2.5">Rota</th>
                    <th className="px-4 py-2.5">Turno</th>
                    <th className="px-4 py-2.5">Saída planejada</th>
                    <th className="px-4 py-2.5">Chegada planejada</th>
                    <th className="px-4 py-2.5">Versão</th>
                    <th className="px-4 py-2.5">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-200 dark:divide-navy-700">
                  {trips.map((t) => (
                    <tr key={t.id}>
                      <td className="px-4 py-2.5 font-mono text-xs text-ink-900 dark:text-white">
                        {t.routeCode}
                      </td>
                      <td className="px-4 py-2.5 text-ink-700 dark:text-white/90">{t.turnLabel}</td>
                      <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-ink-700 dark:text-white/90">
                        {new Date(t.plannedDeparture).toLocaleString('pt-BR', {
                          timeZone: 'UTC',
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-ink-700 dark:text-white/90">
                        {new Date(t.plannedArrival).toLocaleString('pt-BR', {
                          timeZone: 'UTC',
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-ink-500">v{t.routeVersion}</td>
                      <td className="px-4 py-2.5">
                        <Badge tone={STATE_TONE[t.state] ?? 'neutral'}>
                          {t.state.toLowerCase().replace('_', ' ')}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
