import { redirect } from 'next/navigation';

import { Badge } from '@gestlog/ui';

import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

interface Tank {
  id: string;
  code: string;
  name: string;
  product: string;
  capacityMl: string;
  balanceMl: string;
  pendingPurchases: number;
}

interface StatementEntry {
  kind: 'PURCHASE' | 'FILL' | 'TRANSFER_IN' | 'TRANSFER_OUT';
  at: string;
  quantityMl: string;
  label: string;
  status?: string;
}

interface Statement {
  tank: Tank;
  entries: StatementEntry[];
}

const PRODUCT_LABEL: Record<string, string> = {
  DIESEL_S10: 'Diesel S10',
  DIESEL_S500: 'Diesel S500',
  ARLA_32: 'Arla 32',
  GASOLINE_COMMON: 'Gasolina comum',
  GASOLINE_ADDITIVE: 'Gasolina aditivada',
  ETHANOL: 'Etanol',
};

const KIND_LABEL: Record<string, string> = {
  PURCHASE: 'compra',
  FILL: 'abastecimento',
  TRANSFER_IN: 'transferência (entrada)',
  TRANSFER_OUT: 'transferência (saída)',
};

const KIND_TONE: Record<string, 'success' | 'danger' | 'info' | 'warning'> = {
  PURCHASE: 'success',
  FILL: 'danger',
  TRANSFER_IN: 'info',
  TRANSFER_OUT: 'warning',
};

function formatLiters(ml: string): string {
  const n = Number(BigInt(ml)) / 1000;
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} L`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  });
}

export default async function CombustivelPage({
  searchParams,
}: {
  searchParams: Promise<{ tank?: string }>;
}): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect('/login');
  const sp = await searchParams;

  const [{ items: tanks }, me] = await Promise.all([
    apiFetch<{ items: Tank[] }>('/v1/fuel/tanks'),
    apiFetch<{ tenant: { name: string } }>('/v1/me'),
  ]);

  const selectedTankId = sp.tank ?? tanks[0]?.id;
  let statement: Statement | null = null;
  if (selectedTankId) {
    try {
      statement = await apiFetch<Statement>(`/v1/fuel/tanks/${selectedTankId}/statement`);
    } catch {
      statement = null;
    }
  }

  const totalCapacity = tanks.reduce((sum, t) => sum + BigInt(t.capacityMl), 0n);
  const totalBalance = tanks.reduce((sum, t) => sum + BigInt(t.balanceMl), 0n);
  const totalPending = tanks.reduce((sum, t) => sum + t.pendingPurchases, 0);

  return (
    <AppShell session={session} tenantName={me.tenant.name} activePath="/combustivel">
      <div className="space-y-6">
        <header>
          <span className="text-xs font-medium uppercase tracking-widest text-ink-500">
            Frota
          </span>
          <h1 className="mt-1 text-2xl font-semibold text-ink-900 dark:text-white">
            Combustível
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-700 dark:text-white/70">
            Tanques, compras e abastecimentos. Compra e consumo são operações
            independentes (AT-13); compra emergencial fica{' '}
            <code className="rounded bg-surface-100 px-1 text-[11px] dark:bg-navy-800">
              PENDING_APPROVAL
            </code>{' '}
            até ser aprovada por quem tem alçada (AT-14); transferência entre tanques
            conserva o volume total (AT-15).
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Saldo total
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-ink-900 tabular-nums dark:text-white">
              {formatLiters(totalBalance.toString())}
            </div>
            <div className="mt-1 text-xs text-ink-500">
              em {tanks.length} tanque{tanks.length === 1 ? '' : 's'} ativos
            </div>
          </article>
          <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Capacidade total
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-ink-900 tabular-nums dark:text-white">
              {formatLiters(totalCapacity.toString())}
            </div>
            <div className="mt-1 text-xs text-ink-500">
              ocupação{' '}
              {totalCapacity > 0n
                ? `${((Number(totalBalance) / Number(totalCapacity)) * 100).toFixed(0)}%`
                : '—'}
            </div>
          </article>
          <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Compras pendentes
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-warning-600 tabular-nums">
              {totalPending}
            </div>
            <div className="mt-1 text-xs text-ink-500">emergenciais aguardando OK</div>
          </article>
        </section>

        {tanks.length === 0 ? (
          <div className="rounded-card border border-dashed border-surface-200 p-8 text-center text-sm text-ink-500 dark:border-navy-700">
            Nenhum tanque cadastrado ainda. Use <code>POST /v1/fuel/tanks</code>.
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-card border border-surface-200 bg-surface-card shadow-sm dark:border-navy-700 dark:bg-navy-900">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 text-left text-[11px] uppercase tracking-wider text-ink-500 dark:border-navy-700">
                    <th className="px-4 py-2.5">Código</th>
                    <th className="px-4 py-2.5">Nome</th>
                    <th className="px-4 py-2.5">Produto</th>
                    <th className="px-4 py-2.5 text-right">Saldo</th>
                    <th className="px-4 py-2.5 text-right">Capacidade</th>
                    <th className="px-4 py-2.5 text-right">Ocupação</th>
                    <th className="px-4 py-2.5 text-right">Pendentes</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-200 dark:divide-navy-700">
                  {tanks.map((t) => {
                    const balance = BigInt(t.balanceMl);
                    const capacity = BigInt(t.capacityMl);
                    const pct = capacity > 0n ? Number((balance * 100n) / capacity) : 0;
                    return (
                      <tr
                        key={t.id}
                        className={`hover:bg-surface-100/50 dark:hover:bg-navy-800/50 ${
                          t.id === selectedTankId ? 'bg-accent/5' : ''
                        }`}
                      >
                        <td className="px-4 py-2.5 font-mono text-xs text-ink-900 dark:text-white">
                          {t.code}
                        </td>
                        <td className="px-4 py-2.5 text-ink-700 dark:text-white/90">
                          {t.name}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-ink-500">
                          {PRODUCT_LABEL[t.product] ?? t.product}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-900 dark:text-white">
                          {formatLiters(t.balanceMl)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-500">
                          {formatLiters(t.capacityMl)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="inline-flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-100 dark:bg-navy-800">
                              <div
                                className={
                                  pct > 80
                                    ? 'h-full bg-success-600'
                                    : pct > 30
                                    ? 'h-full bg-warning-600'
                                    : 'h-full bg-danger-600'
                                }
                                style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                              />
                            </div>
                            <span className="font-mono text-xs tabular-nums text-ink-500">
                              {pct}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {t.pendingPurchases > 0 ? (
                            <Badge tone="warning">{t.pendingPurchases}</Badge>
                          ) : (
                            <span className="text-xs text-ink-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <a
                            href={`/combustivel?tank=${t.id}`}
                            className="text-xs font-medium text-accent hover:underline"
                          >
                            extrato
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {statement ? (
              <section>
                <h2 className="mb-3 flex items-baseline gap-2 text-sm font-semibold uppercase tracking-wider text-ink-500">
                  Extrato do tanque
                  <span className="font-mono text-xs normal-case tracking-normal text-ink-900 dark:text-white">
                    {statement.tank.code}
                  </span>
                </h2>
                {statement.entries.length === 0 ? (
                  <div className="rounded-card border border-dashed border-surface-200 p-6 text-center text-sm text-ink-500 dark:border-navy-700">
                    Sem movimentação neste tanque ainda.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-card border border-surface-200 bg-surface-card shadow-sm dark:border-navy-700 dark:bg-navy-900">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-surface-200 text-left text-[11px] uppercase tracking-wider text-ink-500 dark:border-navy-700">
                          <th className="px-4 py-2.5">Quando</th>
                          <th className="px-4 py-2.5">Tipo</th>
                          <th className="px-4 py-2.5">Descrição</th>
                          <th className="px-4 py-2.5 text-right">Volume</th>
                          <th className="px-4 py-2.5"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-200 dark:divide-navy-700">
                        {statement.entries.map((e, i) => {
                          const positive = e.kind === 'PURCHASE' || e.kind === 'TRANSFER_IN';
                          return (
                            <tr
                              key={i}
                              className="hover:bg-surface-100/50 dark:hover:bg-navy-800/50"
                            >
                              <td className="px-4 py-2.5 font-mono text-[10px] tabular-nums text-ink-500 whitespace-nowrap">
                                {formatDateTime(e.at)}
                              </td>
                              <td className="px-4 py-2.5">
                                <Badge tone={KIND_TONE[e.kind] ?? 'neutral'}>
                                  {KIND_LABEL[e.kind] ?? e.kind}
                                </Badge>
                              </td>
                              <td className="px-4 py-2.5 text-ink-900 dark:text-white">
                                {e.label}
                              </td>
                              <td
                                className={`px-4 py-2.5 text-right font-mono tabular-nums ${
                                  positive ? 'text-success-600' : 'text-danger-600'
                                }`}
                              >
                                {positive ? '+' : '−'}
                                {formatLiters(e.quantityMl)}
                              </td>
                              <td className="px-4 py-2.5">
                                {e.status === 'PENDING_APPROVAL' ? (
                                  <Badge tone="warning">aguarda OK</Badge>
                                ) : e.status === 'REJECTED' ? (
                                  <Badge tone="danger">rejeitada</Badge>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}
