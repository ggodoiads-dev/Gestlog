import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Badge } from '@gestlog/ui';

import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { formatCents } from '@/lib/format';
import { getSession } from '@/lib/session';

interface OrderRow {
  id: string;
  code: string;
  supplierName: string;
  description: string;
  amountCents: string;
  receivedCents: string;
  invoicedCents: string;
  remainingCents: string;
  currency: string;
  status: 'OPEN' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CLOSED' | 'CANCELLED';
}

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  OPEN: 'info',
  PARTIALLY_RECEIVED: 'warning',
  RECEIVED: 'success',
  CLOSED: 'neutral',
  CANCELLED: 'danger',
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'aberto',
  PARTIALLY_RECEIVED: 'parcial',
  RECEIVED: 'recebido',
  CLOSED: 'fechado',
  CANCELLED: 'cancelado',
};

export default async function ComprasPage(): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect('/login');

  const [{ items }, me] = await Promise.all([
    apiFetch<{ items: OrderRow[] }>('/v1/purchase-orders'),
    apiFetch<{ tenant: { name: string } }>('/v1/me'),
  ]);

  const totalCommitted = items.reduce(
    (acc, o) =>
      o.status === 'CANCELLED' ? acc : acc + BigInt(o.amountCents) - BigInt(o.receivedCents),
    0n,
  );

  return (
    <AppShell session={session} tenantName={me.tenant.name} activePath="/compras">
      <div className="space-y-6">
        <header>
          <span className="text-xs font-medium uppercase tracking-widest text-ink-500">
            Compras
          </span>
          <h1 className="mt-1 text-2xl font-semibold text-ink-900 dark:text-white">
            Pedidos de compra
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-700 dark:text-white/70">
            Fluxo requisição → pedido → recebimento → faturamento. O 3-way match
            grosseiro impede faturar além do recebido.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Pedidos ativos
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-ink-900 tabular-nums dark:text-white">
              {items.filter((o) => o.status !== 'CANCELLED' && o.status !== 'CLOSED').length}
            </div>
          </article>
          <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              A receber
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-ink-900 tabular-nums dark:text-white">
              {formatCents(totalCommitted.toString(), 'BRL')}
            </div>
            <div className="mt-1 text-xs text-ink-500">valor comprometido ainda não recebido</div>
          </article>
          <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Recebidos
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-ink-900 tabular-nums dark:text-white">
              {items.filter((o) => o.status === 'RECEIVED').length}
            </div>
          </article>
        </section>

        {items.length === 0 ? (
          <div className="rounded-card border border-dashed border-surface-200 p-8 text-center text-sm text-ink-500 dark:border-navy-700">
            Nenhum pedido de compra cadastrado.
          </div>
        ) : (
          <div className="overflow-hidden rounded-card border border-surface-200 bg-surface-card shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 text-left text-[11px] uppercase tracking-wider text-ink-500 dark:border-navy-700">
                  <th className="px-4 py-2.5">Código</th>
                  <th className="px-4 py-2.5">Fornecedor</th>
                  <th className="px-4 py-2.5">Descrição</th>
                  <th className="px-4 py-2.5 text-right">Valor</th>
                  <th className="px-4 py-2.5 text-right">Recebido</th>
                  <th className="px-4 py-2.5 text-right">Faturado</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-200 dark:divide-navy-700">
                {items.map((o) => {
                  const total = Number(BigInt(o.amountCents));
                  const received = Number(BigInt(o.receivedCents));
                  const pct = total > 0 ? Math.round((received * 100) / total) : 0;
                  return (
                    <tr key={o.id} className="hover:bg-surface-100/50 dark:hover:bg-navy-800/50">
                      <td className="px-4 py-2.5 font-mono text-xs text-ink-900 dark:text-white">
                        {o.code}
                      </td>
                      <td className="px-4 py-2.5 text-ink-900 dark:text-white">{o.supplierName}</td>
                      <td className="px-4 py-2.5 text-ink-700 dark:text-white/90 max-w-[240px]">
                        <div className="truncate" title={o.description}>
                          {o.description}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-900 dark:text-white">
                        {formatCents(o.amountCents, o.currency)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="font-mono text-xs tabular-nums text-ink-700 dark:text-white/90">
                          {formatCents(o.receivedCents, o.currency)}
                        </div>
                        <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-surface-100 dark:bg-navy-800">
                          <div
                            className="h-full bg-accent"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-ink-500">
                        {formatCents(o.invoicedCents, o.currency)}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={STATUS_TONE[o.status] ?? 'neutral'}>
                          {STATUS_LABEL[o.status] ?? o.status.toLowerCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link
                          href={`/compras/${o.id}`}
                          className="text-xs font-medium text-accent hover:underline"
                        >
                          abrir
                        </Link>
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
