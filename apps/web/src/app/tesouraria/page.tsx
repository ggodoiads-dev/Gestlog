import { redirect } from 'next/navigation';

import { Badge } from '@gestlog/ui';

import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { formatCents } from '@/lib/format';
import { getSession, hasPermission } from '@/lib/session';
import { matchTransactionAction } from '@/lib/treasury-actions';

interface Account {
  id: string;
  alias: string;
  bankCode: string;
  branch: string;
  accountNumber: string;
  currency: string;
  balanceCents: string;
  pendingCount: number;
}

interface PendingTxn {
  id: string;
  postedAt: string;
  kind: 'CREDIT' | 'DEBIT';
  amountCents: string;
  description: string;
  counterpartName: string | null;
  state: string;
  suggestion: { kind: 'receipt' | 'payment'; id: string; label: string; amountCents: string } | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export default async function TesourariaPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect('/login');
  const sp = await searchParams;

  const [{ items: accounts }, me] = await Promise.all([
    apiFetch<{ items: Account[] }>('/v1/bank-accounts'),
    apiFetch<{ tenant: { name: string } }>('/v1/me'),
  ]);

  const selectedAccountId = sp.account ?? accounts[0]?.id;
  let pending: PendingTxn[] = [];
  if (selectedAccountId) {
    const res = await apiFetch<{ items: PendingTxn[] }>(
      `/v1/bank-accounts/${selectedAccountId}/transactions/pending`,
    );
    pending = res.items;
  }

  const canReconcile = hasPermission(session, 'finance.bank.reconcile');
  const totalBalance = accounts.reduce(
    (sum, a) => sum + BigInt(a.balanceCents),
    0n,
  );
  const totalPending = accounts.reduce((sum, a) => sum + a.pendingCount, 0);

  return (
    <AppShell session={session} tenantName={me.tenant.name} activePath="/tesouraria">
      <div className="space-y-6">
        <header>
          <span className="text-xs font-medium uppercase tracking-widest text-ink-500">
            Financeiro
          </span>
          <h1 className="mt-1 text-2xl font-semibold text-ink-900 dark:text-white">
            Tesouraria
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-700 dark:text-white/70">
            Conciliação do extrato bancário com Receipt (entradas) e Payment (saídas
            CONFIRMED). Importação por OFX ou API é idempotente — o mesmo movimento
            trazido duas vezes não duplica.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Contas ativas
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-ink-900 tabular-nums dark:text-white">
              {accounts.length}
            </div>
          </article>
          <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Saldo consolidado
            </div>
            <div
              className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
                totalBalance >= 0n ? 'text-success-600' : 'text-danger-600'
              }`}
            >
              {formatCents(totalBalance.toString(), 'BRL')}
            </div>
            <div className="mt-1 text-xs text-ink-500">soma dos movimentos não ignorados</div>
          </article>
          <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Pendentes de conciliação
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-warning-600 tabular-nums">
              {totalPending}
            </div>
            <div className="mt-1 text-xs text-ink-500">esperando match ou ignore</div>
          </article>
        </section>

        {accounts.length === 0 ? (
          <div className="rounded-card border border-dashed border-surface-200 p-8 text-center text-sm text-ink-500 dark:border-navy-700">
            Nenhuma conta bancária cadastrada ainda. Use o endpoint{' '}
            <code className="font-mono">POST /v1/bank-accounts</code> para começar.
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-card border border-surface-200 bg-surface-card shadow-sm dark:border-navy-700 dark:bg-navy-900">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 text-left text-[11px] uppercase tracking-wider text-ink-500 dark:border-navy-700">
                    <th className="px-4 py-2.5">Conta</th>
                    <th className="px-4 py-2.5">Banco / Agência / Nº</th>
                    <th className="px-4 py-2.5 text-right">Saldo</th>
                    <th className="px-4 py-2.5 text-right">Pendentes</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-200 dark:divide-navy-700">
                  {accounts.map((a) => (
                    <tr
                      key={a.id}
                      className={`hover:bg-surface-100/50 dark:hover:bg-navy-800/50 ${
                        a.id === selectedAccountId
                          ? 'bg-accent/5'
                          : ''
                      }`}
                    >
                      <td className="px-4 py-2.5 text-ink-900 dark:text-white">{a.alias}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-ink-500">
                        {a.bankCode} · {a.branch} · {a.accountNumber}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-mono tabular-nums ${
                          BigInt(a.balanceCents) >= 0n
                            ? 'text-ink-900 dark:text-white'
                            : 'text-danger-600'
                        }`}
                      >
                        {formatCents(a.balanceCents, a.currency)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {a.pendingCount > 0 ? (
                          <Badge tone="warning">{a.pendingCount}</Badge>
                        ) : (
                          <span className="text-xs text-ink-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <a
                          href={`/tesouraria?account=${a.id}`}
                          className="text-xs font-medium text-accent hover:underline"
                        >
                          abrir
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-500">
                Movimentos pendentes
              </h2>
              {pending.length === 0 ? (
                <div className="rounded-card border border-dashed border-surface-200 p-6 text-center text-sm text-ink-500 dark:border-navy-700">
                  Nada pendente nesta conta.
                </div>
              ) : (
                <div className="overflow-hidden rounded-card border border-surface-200 bg-surface-card shadow-sm dark:border-navy-700 dark:bg-navy-900">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-200 text-left text-[11px] uppercase tracking-wider text-ink-500 dark:border-navy-700">
                        <th className="px-4 py-2.5">Data</th>
                        <th className="px-4 py-2.5">Descrição</th>
                        <th className="px-4 py-2.5 text-right">Valor</th>
                        <th className="px-4 py-2.5">Sugestão</th>
                        <th className="px-4 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-200 dark:divide-navy-700">
                      {pending.map((t) => (
                        <tr key={t.id} className="hover:bg-surface-100/50 dark:hover:bg-navy-800/50">
                          <td className="px-4 py-2.5 font-mono text-xs text-ink-500 whitespace-nowrap">
                            {formatDate(t.postedAt)}
                          </td>
                          <td className="px-4 py-2.5 text-ink-900 dark:text-white">
                            {t.description}
                            {t.counterpartName ? (
                              <div className="text-[10px] text-ink-500">{t.counterpartName}</div>
                            ) : null}
                          </td>
                          <td
                            className={`px-4 py-2.5 text-right font-mono tabular-nums ${
                              t.kind === 'CREDIT' ? 'text-success-600' : 'text-danger-600'
                            }`}
                          >
                            {t.kind === 'CREDIT' ? '+' : '−'}
                            {formatCents(t.amountCents, 'BRL')}
                          </td>
                          <td className="px-4 py-2.5">
                            {t.suggestion ? (
                              <div className="text-xs text-ink-700 dark:text-white/80">
                                {t.suggestion.label}
                                <div className="text-[10px] text-ink-500">
                                  {t.suggestion.kind === 'receipt' ? 'receipt' : 'payment'} ·{' '}
                                  {formatCents(t.suggestion.amountCents, 'BRL')}
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-ink-500">sem match óbvio</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {canReconcile && t.suggestion ? (
                              <form action={matchTransactionAction}>
                                <input type="hidden" name="transactionId" value={t.id} />
                                <input
                                  type="hidden"
                                  name="kind"
                                  value={t.suggestion.kind}
                                />
                                <input
                                  type="hidden"
                                  name="partnerId"
                                  value={t.suggestion.id}
                                />
                                <button
                                  type="submit"
                                  className="rounded-control bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-hover"
                                >
                                  conciliar
                                </button>
                              </form>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
