import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { Badge } from '@gestlog/ui';

import { AppShell } from '@/components/app-shell';
import { ApiError, apiFetch } from '@/lib/api';
import { formatCents, formatIsoDate } from '@/lib/format';
import { getSession, hasPermission } from '@/lib/session';
import { ReceiveForm } from './receive-form';

interface OrderDetail {
  id: string;
  code: string;
  status: 'OPEN' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CLOSED' | 'CANCELLED';
  supplierName: string;
  supplierCnpj: string | null;
  description: string;
  amountCents: string;
  receivedCents: string;
  invoicedCents: string;
  remainingCents: string;
  currency: string;
  approvalId: string | null;
  receipts: { id: string; amountCents: string; receivedAt: string; reference: string | null }[];
}

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  OPEN: 'info',
  PARTIALLY_RECEIVED: 'warning',
  RECEIVED: 'success',
  CLOSED: 'neutral',
  CANCELLED: 'danger',
};

export default async function CompraDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect('/login');
  const { id } = await params;

  let order: OrderDetail;
  try {
    order = await apiFetch<OrderDetail>(`/v1/purchase-orders/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const me = await apiFetch<{ tenant: { name: string } }>('/v1/me');

  const canReceive = hasPermission(session, 'procurement.receive');
  const isClosed = order.status === 'RECEIVED' || order.status === 'CANCELLED' || order.status === 'CLOSED';
  const total = Number(BigInt(order.amountCents));
  const received = Number(BigInt(order.receivedCents));
  const pct = total > 0 ? Math.round((received * 100) / total) : 0;

  return (
    <AppShell session={session} tenantName={me.tenant.name} activePath="/compras">
      <div className="space-y-6">
        <nav className="text-xs text-ink-500">
          <Link href="/compras" className="hover:text-accent">
            Compras
          </Link>{' '}
          / <span className="font-mono">{order.code}</span>
        </nav>

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge tone={STATUS_TONE[order.status] ?? 'neutral'}>
                {order.status.toLowerCase().replace('_', ' ')}
              </Badge>
              <span className="text-xs text-ink-500">pedido {order.code}</span>
              {order.approvalId ? (
                <Link
                  href={`/aprovacoes/${order.approvalId}`}
                  className="text-xs text-accent hover:underline"
                >
                  ver aprovação →
                </Link>
              ) : null}
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-ink-900 dark:text-white">
              {order.supplierName}
            </h1>
            <p className="mt-1 text-sm text-ink-700 dark:text-white/70">{order.description}</p>
          </div>
          <div className="min-w-[220px] rounded-card border border-surface-200 bg-surface-card p-4 text-right shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Restante a receber
            </div>
            <div
              className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${
                order.remainingCents === '0' ? 'text-success-600' : 'text-ink-900 dark:text-white'
              }`}
            >
              {formatCents(order.remainingCents, order.currency)}
            </div>
            <div className="mt-1 text-xs text-ink-500">
              de {formatCents(order.amountCents, order.currency)}
            </div>
          </div>
        </header>

        <section className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
          <div className="flex items-center justify-between text-xs text-ink-500">
            <span>Progresso do recebimento</span>
            <span className="font-mono tabular-nums">{pct}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-100 dark:bg-navy-800">
            <div
              className={`h-full transition-all ${pct === 100 ? 'bg-success-600' : 'bg-accent'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs font-mono tabular-nums text-ink-500">
            <span>
              recebido {formatCents(order.receivedCents, order.currency)} · faturado{' '}
              {formatCents(order.invoicedCents, order.currency)}
            </span>
            <span>total {formatCents(order.amountCents, order.currency)}</span>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
            Registrar recebimento
          </h2>
          {isClosed ? (
            <div className="rounded-card border border-dashed border-surface-200 p-6 text-sm text-ink-500 dark:border-navy-700">
              Pedido {order.status.toLowerCase().replace('_', ' ')} — não aceita novos recebimentos.
            </div>
          ) : !canReceive ? (
            <div className="rounded-card border border-dashed border-surface-200 p-6 text-sm text-ink-500 dark:border-navy-700">
              Seu perfil não tem permissão <code>procurement.receive</code>.
            </div>
          ) : (
            <ReceiveForm
              orderId={order.id}
              remainingCents={order.remainingCents}
              currency={order.currency}
            />
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
            Histórico de recebimentos
          </h2>
          {order.receipts.length === 0 ? (
            <div className="rounded-card border border-dashed border-surface-200 p-6 text-sm text-ink-500 dark:border-navy-700">
              Nenhum recebimento ainda.
            </div>
          ) : (
            <div className="overflow-hidden rounded-card border border-surface-200 bg-surface-card shadow-sm dark:border-navy-700 dark:bg-navy-900">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 text-left text-[11px] uppercase tracking-wider text-ink-500 dark:border-navy-700">
                    <th className="px-4 py-2.5">Recebido em</th>
                    <th className="px-4 py-2.5">Referência</th>
                    <th className="px-4 py-2.5 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-200 dark:divide-navy-700">
                  {order.receipts.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-ink-700 dark:text-white/90">
                        {formatIsoDate(r.receivedAt)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-ink-700 dark:text-white/90">
                        {r.reference ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-900 dark:text-white">
                        {formatCents(r.amountCents, order.currency)}
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
