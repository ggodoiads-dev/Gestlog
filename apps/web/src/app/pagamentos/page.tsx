import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Badge } from '@gestlog/ui';

import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { formatCents, formatIsoDate } from '@/lib/format';
import { getSession } from '@/lib/session';

interface PayableRow {
  id: string;
  supplierName: string;
  description: string;
  amountCents: string;
  paidCents: string;
  balanceCents: string;
  currency: string;
  dueDate: string;
  status: 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'CONTESTED' | 'CANCELLED';
}

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  OPEN: 'info',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  CONTESTED: 'danger',
  CANCELLED: 'neutral',
};

function daysToDue(dueDate: string): number {
  const now = new Date();
  const due = new Date(`${dueDate}T00:00:00Z`);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export default async function PagamentosPage(): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect('/login');

  const [{ items }, me] = await Promise.all([
    apiFetch<{ items: PayableRow[] }>('/v1/payables'),
    apiFetch<{ tenant: { name: string } }>('/v1/me'),
  ]);

  const totalOpenCents = items.reduce((acc, p) => acc + BigInt(p.balanceCents), 0n);
  const overdue = items.filter((p) => daysToDue(p.dueDate) < 0);
  const overdueCents = overdue.reduce((acc, p) => acc + BigInt(p.balanceCents), 0n);

  return (
    <AppShell session={session} tenantName={me.tenant.name} activePath="/pagamentos">
      <div className="space-y-6">
        <header>
          <span className="text-xs font-medium uppercase tracking-widest text-ink-500">
            Financeiro
          </span>
          <h1 className="mt-1 text-2xl font-semibold text-ink-900 dark:text-white">
            Contas a pagar
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-700 dark:text-white/70">
            Títulos em aberto. Pagamento com retorno bancário desconhecido é gravado como fato
            sem baixar saldo — zero retry cego.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Em aberto
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-ink-900 tabular-nums dark:text-white">
              {formatCents(totalOpenCents.toString(), 'BRL')}
            </div>
            <div className="mt-1 text-xs text-ink-500">{items.length} título(s)</div>
          </article>
          <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Vencidos
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-danger-600 tabular-nums">
              {formatCents(overdueCents.toString(), 'BRL')}
            </div>
            <div className="mt-1 text-xs text-ink-500">{overdue.length} título(s) atrasado(s)</div>
          </article>
          <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Próximos 7 dias
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-ink-900 tabular-nums dark:text-white">
              {
                items.filter((p) => {
                  const d = daysToDue(p.dueDate);
                  return d >= 0 && d <= 7;
                }).length
              }
            </div>
            <div className="mt-1 text-xs text-ink-500">título(s) a vencer</div>
          </article>
        </section>

        {items.length === 0 ? (
          <div className="rounded-card border border-dashed border-surface-200 p-8 text-center text-sm text-ink-500 dark:border-navy-700">
            Nenhuma conta a pagar em aberto.
          </div>
        ) : (
          <div className="overflow-hidden rounded-card border border-surface-200 bg-surface-card shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 text-left text-[11px] uppercase tracking-wider text-ink-500 dark:border-navy-700">
                  <th className="px-4 py-2.5">Fornecedor</th>
                  <th className="px-4 py-2.5">Descrição</th>
                  <th className="px-4 py-2.5 text-right">Valor</th>
                  <th className="px-4 py-2.5 text-right">Saldo</th>
                  <th className="px-4 py-2.5">Vencimento</th>
                  <th className="px-4 py-2.5">Em</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-200 dark:divide-navy-700">
                {items.map((p) => {
                  const days = daysToDue(p.dueDate);
                  const isOverdue = days < 0;
                  const hasPaid = p.paidCents !== '0';
                  return (
                    <tr key={p.id} className="hover:bg-surface-100/50 dark:hover:bg-navy-800/50">
                      <td className="px-4 py-2.5 text-ink-900 dark:text-white">{p.supplierName}</td>
                      <td className="px-4 py-2.5 text-ink-700 dark:text-white/90 max-w-[260px]">
                        <div className="truncate" title={p.description}>
                          {p.description}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-700 dark:text-white/90">
                        {formatCents(p.amountCents, p.currency)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="font-mono tabular-nums text-ink-900 dark:text-white">
                          {formatCents(p.balanceCents, p.currency)}
                        </span>
                        {hasPaid ? (
                          <span className="ml-1 text-[10px] text-ink-500">(parcial)</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-ink-500">
                        {formatIsoDate(p.dueDate)}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-xs font-medium ${
                          isOverdue ? 'text-danger-600' : 'text-ink-500'
                        }`}
                      >
                        {isOverdue ? `${Math.abs(days)}d atrasado` : `${days}d restantes`}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={STATUS_TONE[p.status] ?? 'neutral'}>
                          {p.status.toLowerCase().replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link
                          href={`/pagamentos/${p.id}`}
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
