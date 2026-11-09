import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { Badge } from '@gestlog/ui';

import { AppShell } from '@/components/app-shell';
import { ApiError, apiFetch } from '@/lib/api';
import { formatCents, formatIsoDate } from '@/lib/format';
import { getSession, hasPermission } from '@/lib/session';
import { PayForm } from './pay-form';

interface PayableDetail {
  id: string;
  orderId: string | null;
  orderCode: string | null;
  supplierName: string;
  supplierCnpj: string | null;
  description: string;
  amountCents: string;
  paidCents: string;
  balanceCents: string;
  currency: string;
  dueDate: string;
  status: 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'CONTESTED' | 'CANCELLED';
  issuedAt: string;
  paidAt: string | null;
  payments: {
    paymentId: string;
    amountCents: string;
    method: 'MANUAL' | 'BANK_API' | 'PIX' | 'OFX_IMPORT';
    externalStatus: 'CONFIRMED' | 'PROCESSING' | 'UNKNOWN' | 'REJECTED';
    paidAt: string;
    reference: string | null;
  }[];
}

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  OPEN: 'info',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  CONTESTED: 'danger',
  CANCELLED: 'neutral',
};

const EXT_STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  CONFIRMED: 'success',
  PROCESSING: 'info',
  UNKNOWN: 'warning',
  REJECTED: 'danger',
};

const METHOD_LABEL: Record<string, string> = {
  MANUAL: 'Manual',
  BANK_API: 'API bancária',
  PIX: 'PIX',
  OFX_IMPORT: 'Import OFX',
};

export default async function PagamentoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect('/login');
  const { id } = await params;

  let payable: PayableDetail;
  try {
    payable = await apiFetch<PayableDetail>(`/v1/payables/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const me = await apiFetch<{ tenant: { name: string } }>('/v1/me');

  const canPay = hasPermission(session, 'ap.payments.execute');
  const isClosed = payable.status === 'PAID' || payable.status === 'CANCELLED';
  const total = Number(BigInt(payable.amountCents));
  const paid = Number(BigInt(payable.paidCents));
  const pct = total > 0 ? Math.round((paid * 100) / total) : 0;

  return (
    <AppShell session={session} tenantName={me.tenant.name} activePath="/pagamentos">
      <div className="space-y-6">
        <nav className="text-xs text-ink-500">
          <Link href="/pagamentos" className="hover:text-accent">
            Contas a pagar
          </Link>{' '}
          /{' '}
          <span className="font-mono">
            {payable.supplierName} · {formatIsoDate(payable.dueDate)}
          </span>
        </nav>

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge tone={STATUS_TONE[payable.status] ?? 'neutral'}>
                {payable.status.toLowerCase().replace('_', ' ')}
              </Badge>
              <span className="text-xs text-ink-500">
                emitido em {formatIsoDate(payable.issuedAt)}
                {payable.paidAt ? ` · pago em ${formatIsoDate(payable.paidAt)}` : ''}
              </span>
              {payable.orderId && payable.orderCode ? (
                <Link
                  href={`/compras/${payable.orderId}`}
                  className="text-xs text-accent hover:underline"
                >
                  pedido {payable.orderCode} →
                </Link>
              ) : null}
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-ink-900 dark:text-white">
              {payable.supplierName}
            </h1>
            <p className="mt-1 text-sm text-ink-700 dark:text-white/70">{payable.description}</p>
          </div>
          <div className="min-w-[220px] rounded-card border border-surface-200 bg-surface-card p-4 text-right shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Saldo a pagar
            </div>
            <div
              className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${
                payable.balanceCents === '0' ? 'text-success-600' : 'text-ink-900 dark:text-white'
              }`}
            >
              {formatCents(payable.balanceCents, payable.currency)}
            </div>
            <div className="mt-1 text-xs text-ink-500">
              de {formatCents(payable.amountCents, payable.currency)} · vence{' '}
              {formatIsoDate(payable.dueDate)}
            </div>
          </div>
        </header>

        <section className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
          <div className="flex items-center justify-between text-xs text-ink-500">
            <span>Progresso do pagamento</span>
            <span className="font-mono tabular-nums">{pct}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-100 dark:bg-navy-800">
            <div
              className={`h-full transition-all ${pct === 100 ? 'bg-success-600' : 'bg-accent'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs font-mono tabular-nums text-ink-500">
            <span>pago {formatCents(payable.paidCents, payable.currency)}</span>
            <span>total {formatCents(payable.amountCents, payable.currency)}</span>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
            Executar pagamento
          </h2>
          {isClosed ? (
            <div className="rounded-card border border-dashed border-surface-200 p-6 text-sm text-ink-500 dark:border-navy-700">
              Payable {payable.status.toLowerCase().replace('_', ' ')} — não aceita novos pagamentos.
            </div>
          ) : !canPay ? (
            <div className="rounded-card border border-dashed border-surface-200 p-6 text-sm text-ink-500 dark:border-navy-700">
              Seu perfil não tem permissão <code>ap.payments.execute</code>. SoD exige papel
              distinto do aprovador.
            </div>
          ) : (
            <PayForm
              payableId={payable.id}
              balanceCents={payable.balanceCents}
              currency={payable.currency}
            />
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
            Histórico de pagamentos
          </h2>
          {payable.payments.length === 0 ? (
            <div className="rounded-card border border-dashed border-surface-200 p-6 text-sm text-ink-500 dark:border-navy-700">
              Nenhum pagamento registrado ainda.
            </div>
          ) : (
            <div className="overflow-hidden rounded-card border border-surface-200 bg-surface-card shadow-sm dark:border-navy-700 dark:bg-navy-900">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 text-left text-[11px] uppercase tracking-wider text-ink-500 dark:border-navy-700">
                    <th className="px-4 py-2.5">Data</th>
                    <th className="px-4 py-2.5">Método</th>
                    <th className="px-4 py-2.5">Status externo</th>
                    <th className="px-4 py-2.5">Referência</th>
                    <th className="px-4 py-2.5 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-200 dark:divide-navy-700">
                  {payable.payments.map((p) => (
                    <tr key={p.paymentId}>
                      <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-ink-700 dark:text-white/90">
                        {formatIsoDate(p.paidAt)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-ink-500">
                        {METHOD_LABEL[p.method] ?? p.method}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={EXT_STATUS_TONE[p.externalStatus] ?? 'neutral'}>
                          {p.externalStatus.toLowerCase()}
                        </Badge>
                        {p.externalStatus === 'UNKNOWN' ? (
                          <span className="ml-1 text-[10px] text-warning-600">
                            (sem efeito no saldo)
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-ink-700 dark:text-white/90">
                        {p.reference ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-900 dark:text-white">
                        {formatCents(p.amountCents, payable.currency)}
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
