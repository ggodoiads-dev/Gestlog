import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { Badge } from '@gestlog/ui';

import { AppShell } from '@/components/app-shell';
import { ApiError, apiFetch } from '@/lib/api';
import { formatCents, formatCompetence, formatIsoDate } from '@/lib/format';
import { getSession, hasPermission } from '@/lib/session';
import { RegisterReceiptForm } from './register-receipt-form';

interface ReceivableDetail {
  id: string;
  contractId: string;
  contractCode: string;
  clientId: string;
  clientName: string;
  competence: string;
  amountCents: string;
  paidCents: string;
  balanceCents: string;
  currency: string;
  status: 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'CONTESTED' | 'WRITTEN_OFF';
  dueDate: string;
  issuedAt: string;
  paidAt: string | null;
  allocations: {
    receiptId: string;
    amountCents: string;
    receivedAt: string;
    source: 'MANUAL' | 'BANK_OFX' | 'BANK_API' | 'PIX';
    reference: string | null;
  }[];
}

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  OPEN: 'info',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  CONTESTED: 'danger',
  WRITTEN_OFF: 'neutral',
};

const SOURCE_LABEL: Record<string, string> = {
  MANUAL: 'Manual',
  BANK_OFX: 'OFX',
  BANK_API: 'API bancária',
  PIX: 'PIX',
};

export default async function ReceivableDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect('/login');
  const { id } = await params;

  let receivable: ReceivableDetail;
  try {
    receivable = await apiFetch<ReceivableDetail>(`/v1/receivables/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const me = await apiFetch<{ tenant: { name: string } }>('/v1/me');

  const canPay = hasPermission(session, 'ar.receivables.write');
  const isClosed =
    receivable.status === 'PAID' || receivable.status === 'WRITTEN_OFF';
  const progressPct =
    receivable.amountCents === '0'
      ? 0
      : Math.min(
          100,
          Math.round(
            (Number(BigInt(receivable.paidCents)) * 100) / Number(BigInt(receivable.amountCents)),
          ),
        );

  return (
    <AppShell session={session} tenantName={me.tenant.name} activePath="/recebiveis">
      <div className="space-y-6">
        <nav className="text-xs text-ink-500">
          <Link href="/recebiveis" className="hover:text-accent">
            Recebíveis
          </Link>{' '}
          /{' '}
          <span className="font-mono">
            {receivable.contractCode} · {formatCompetence(receivable.competence)}
          </span>
        </nav>

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge tone={STATUS_TONE[receivable.status] ?? 'neutral'}>
                {receivable.status.toLowerCase().replace('_', ' ')}
              </Badge>
              <span className="text-xs text-ink-500">
                emitido em {formatIsoDate(receivable.issuedAt)}
                {receivable.paidAt
                  ? ` · pago em ${formatIsoDate(receivable.paidAt)}`
                  : ''}
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-ink-900 dark:text-white">
              {receivable.clientName}
            </h1>
            <p className="text-sm text-ink-700 dark:text-white/70">
              Contrato{' '}
              <Link
                href={`/contratos/${receivable.contractId}`}
                className="font-mono text-accent hover:underline"
              >
                {receivable.contractCode}
              </Link>{' '}
              · competência {formatCompetence(receivable.competence)}
            </p>
          </div>
          <div className="min-w-[220px] rounded-card border border-surface-200 bg-surface-card p-4 text-right shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Saldo em aberto
            </div>
            <div
              className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${
                receivable.balanceCents === '0' ? 'text-success-600' : 'text-ink-900 dark:text-white'
              }`}
            >
              {formatCents(receivable.balanceCents, receivable.currency)}
            </div>
            <div className="mt-1 text-xs text-ink-500">
              de {formatCents(receivable.amountCents, receivable.currency)} · vence{' '}
              {formatIsoDate(receivable.dueDate)}
            </div>
          </div>
        </header>

        <section className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
          <div className="flex items-center justify-between text-xs text-ink-500">
            <span>Progresso do pagamento</span>
            <span className="font-mono tabular-nums">{progressPct}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-100 dark:bg-navy-800">
            <div
              className={`h-full transition-all ${
                progressPct === 100 ? 'bg-success-600' : 'bg-accent'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs font-mono tabular-nums text-ink-500">
            <span>pago {formatCents(receivable.paidCents, receivable.currency)}</span>
            <span>total {formatCents(receivable.amountCents, receivable.currency)}</span>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
            Registrar pagamento
          </h2>
          {isClosed ? (
            <div className="rounded-card border border-dashed border-surface-200 p-6 text-sm text-ink-500 dark:border-navy-700">
              Recebível{' '}
              <span className="font-mono">{receivable.status.toLowerCase().replace('_', ' ')}</span>{' '}
              — não aceita novos pagamentos.
            </div>
          ) : !canPay ? (
            <div className="rounded-card border border-dashed border-surface-200 p-6 text-sm text-ink-500 dark:border-navy-700">
              Seu perfil não tem permissão <code>ar.receivables.write</code>.
            </div>
          ) : (
            <RegisterReceiptForm
              receivableId={receivable.id}
              balanceCents={receivable.balanceCents}
              currency={receivable.currency}
            />
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
            Histórico de pagamentos
          </h2>
          {receivable.allocations.length === 0 ? (
            <div className="rounded-card border border-dashed border-surface-200 p-6 text-sm text-ink-500 dark:border-navy-700">
              Nenhum pagamento registrado ainda.
            </div>
          ) : (
            <div className="overflow-hidden rounded-card border border-surface-200 bg-surface-card shadow-sm dark:border-navy-700 dark:bg-navy-900">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 text-left text-[11px] uppercase tracking-wider text-ink-500 dark:border-navy-700">
                    <th className="px-4 py-2.5">Recebido em</th>
                    <th className="px-4 py-2.5">Fonte</th>
                    <th className="px-4 py-2.5">Referência</th>
                    <th className="px-4 py-2.5 text-right">Valor alocado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-200 dark:divide-navy-700">
                  {receivable.allocations.map((a) => (
                    <tr key={a.receiptId}>
                      <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-ink-700 dark:text-white/90">
                        {formatIsoDate(a.receivedAt)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-ink-500">
                        {SOURCE_LABEL[a.source] ?? a.source}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-ink-700 dark:text-white/90">
                        {a.reference ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-900 dark:text-white">
                        {formatCents(a.amountCents, receivable.currency)}
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
