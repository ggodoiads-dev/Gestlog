import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { Badge } from '@gestlog/ui';

import { AppShell } from '@/components/app-shell';
import { ApiError, apiFetch } from '@/lib/api';
import { formatCents, formatCompetence, formatIsoDate } from '@/lib/format';
import { getSession, hasPermission } from '@/lib/session';
import { IssueReceivableForm } from './issue-receivable-form';

interface ContractDetail {
  id: string;
  code: string;
  title: string;
  status: string;
  clientId: string;
  clientName: string;
  pricingMode: 'MONTHLY_FIXED' | 'PER_TRIP' | null;
  pricingAmountCents: string | null;
  pricingCurrency: string;
  startDate: string | null;
  endDate: string | null;
}

interface PreInvoice {
  contractId: string;
  contractCode: string;
  competence: string;
  totalAmountCents: string;
  currency: string;
  items: {
    measurementId: string;
    kind: 'MONTHLY_FIXED' | 'PER_TRIP';
    quantity: string;
    unitPriceCents: string;
    amountCents: string;
    scheduledTripId: string | null;
  }[];
}

function defaultCompetence(): { year: number; month: number } {
  const d = new Date();
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export default async function ContratoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
}): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect('/login');
  const { id } = await params;
  const sp = await searchParams;

  let contract: ContractDetail;
  try {
    contract = await apiFetch<ContractDetail>(`/v1/contracts/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const me = await apiFetch<{ tenant: { name: string } }>('/v1/me');

  const defaults = defaultCompetence();
  const year = sp.year ? Number.parseInt(sp.year, 10) : defaults.year;
  const month = sp.month ? Number.parseInt(sp.month, 10) : defaults.month;

  let preInvoice: PreInvoice | null = null;
  let preInvoiceError: string | null = null;
  try {
    preInvoice = await apiFetch<PreInvoice>(
      `/v1/billing/pre-invoices/${contract.id}?year=${year}&month=${month}`,
    );
  } catch (err) {
    preInvoiceError = err instanceof Error ? err.message : 'erro ao carregar pré-fatura';
  }

  const canIssue = hasPermission(session, 'ar.receivables.issue');

  return (
    <AppShell session={session} tenantName={me.tenant.name} activePath="/contratos">
      <div className="space-y-6">
        <nav className="text-xs text-ink-500">
          <Link href="/contratos" className="hover:text-accent">
            Contratos
          </Link>{' '}
          / {contract.code}
        </nav>
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-ink-500">{contract.code}</span>
            <Badge tone={contract.status === 'ACTIVE' ? 'success' : 'neutral'}>
              {contract.status.toLowerCase().replace('_', ' ')}
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold text-ink-900 dark:text-white">{contract.title}</h1>
          <p className="text-sm text-ink-700 dark:text-white/70">Cliente: {contract.clientName}</p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Modelo de preço
            </div>
            <div className="mt-2 text-lg font-semibold text-ink-900 dark:text-white">
              {contract.pricingMode === 'MONTHLY_FIXED'
                ? 'Mensal fixo'
                : contract.pricingMode === 'PER_TRIP'
                  ? 'Por viagem'
                  : 'Não configurado'}
            </div>
          </article>
          <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Valor vigente
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-ink-900 tabular-nums dark:text-white">
              {formatCents(contract.pricingAmountCents, contract.pricingCurrency)}
            </div>
            <div className="mt-1 text-xs text-ink-500">
              {contract.pricingMode === 'PER_TRIP' ? 'por viagem' : 'por mês'}
            </div>
          </article>
          <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Vigência
            </div>
            <div className="mt-2 font-mono text-sm tabular-nums text-ink-900 dark:text-white">
              {formatIsoDate(contract.startDate)} → {formatIsoDate(contract.endDate)}
            </div>
          </article>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
                Pré-fatura
              </h2>
              <p className="mt-1 text-xs text-ink-500">
                Medições agregadas para a competência selecionada.
              </p>
            </div>
            <form className="flex items-center gap-2 text-xs">
              <label htmlFor="year" className="text-ink-500">
                competência
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
              <button
                type="submit"
                className="h-9 rounded-control bg-accent px-3 text-xs font-medium text-white hover:bg-accent-hover"
              >
                aplicar
              </button>
            </form>
          </div>

          {preInvoiceError ? (
            <div className="rounded-card border border-danger-600/40 bg-danger-600/5 px-4 py-3 text-sm text-danger-600">
              {preInvoiceError}
            </div>
          ) : !preInvoice || preInvoice.items.length === 0 ? (
            <div className="rounded-card border border-dashed border-surface-200 p-6 text-sm text-ink-500 dark:border-navy-700">
              Sem medições para {formatCompetence(`${year}-${String(month).padStart(2, '0')}`)}.
              Valide viagens pela API para gerá-las.
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-card border border-surface-200 bg-surface-card shadow-sm dark:border-navy-700 dark:bg-navy-900">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-200 text-left text-[11px] uppercase tracking-wider text-ink-500 dark:border-navy-700">
                      <th className="px-4 py-2.5">Tipo</th>
                      <th className="px-4 py-2.5 text-right">Quantidade</th>
                      <th className="px-4 py-2.5 text-right">Preço unit.</th>
                      <th className="px-4 py-2.5 text-right">Valor</th>
                      <th className="px-4 py-2.5">Viagem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-200 dark:divide-navy-700">
                    {preInvoice.items.map((item) => (
                      <tr key={item.measurementId}>
                        <td className="px-4 py-2.5">
                          <Badge tone={item.kind === 'MONTHLY_FIXED' ? 'accent' : 'info'}>
                            {item.kind === 'MONTHLY_FIXED' ? 'mensal fixo' : 'por viagem'}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-700 dark:text-white/90">
                          {item.quantity}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-700 dark:text-white/90">
                          {formatCents(item.unitPriceCents, preInvoice.currency)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-900 dark:text-white">
                          {formatCents(item.amountCents, preInvoice.currency)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[10px] text-ink-500">
                          {item.scheduledTripId ? item.scheduledTripId.slice(0, 8) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-surface-200 bg-surface-100/50 dark:border-navy-700 dark:bg-navy-800/50">
                      <td className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-ink-500" colSpan={3}>
                        Total — {formatCompetence(preInvoice.competence)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-base font-semibold tabular-nums text-ink-900 dark:text-white">
                        {formatCents(preInvoice.totalAmountCents, preInvoice.currency)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {canIssue ? (
                <IssueReceivableForm
                  contractId={contract.id}
                  competenceYear={year}
                  competenceMonth={month}
                  totalAmountCents={preInvoice.totalAmountCents}
                  currency={preInvoice.currency}
                />
              ) : (
                <p className="text-xs text-ink-500">
                  Seu perfil não tem permissão <code>ar.receivables.issue</code>.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
