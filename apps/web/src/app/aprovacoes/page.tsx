import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Badge } from '@gestlog/ui';

import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { formatCents, formatIsoDate } from '@/lib/format';
import { getSession } from '@/lib/session';

interface ApprovalRow {
  id: string;
  subjectType: string;
  subjectId: string;
  state: 'PENDING' | 'APPROVED' | 'REJECTED' | 'RETURNED' | 'CANCELLED' | 'SUPERSEDED';
  requiredApprovals: number;
  approvalsReceived: number;
  reason: string;
  amountCents: string | null;
  currency: string | null;
  requestedBy: string;
  createdAt: string;
  decidedAt: string | null;
}

const STATE_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  RETURNED: 'info',
  CANCELLED: 'neutral',
  SUPERSEDED: 'neutral',
};

const SUBJECT_LABEL: Record<string, string> = {
  payment: 'Pagamento',
  pricing: 'Preço',
  contract: 'Contrato',
  capex: 'CAPEX',
  asset_sale: 'Alienação de ativo',
};

export default async function AprovacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect('/login');
  const sp = await searchParams;
  const state = (sp.state ?? 'PENDING') as ApprovalRow['state'];

  const [{ items }, me] = await Promise.all([
    apiFetch<{ items: ApprovalRow[] }>(`/v1/approvals?state=${state}`),
    apiFetch<{ tenant: { name: string } }>('/v1/me'),
  ]);

  const tabs = ['PENDING', 'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED'] as const;

  return (
    <AppShell session={session} tenantName={me.tenant.name} activePath="/aprovacoes">
      <div className="space-y-6">
        <header>
          <span className="text-xs font-medium uppercase tracking-widest text-ink-500">
            Governança
          </span>
          <h1 className="mt-1 text-2xl font-semibold text-ink-900 dark:text-white">
            Central de aprovações
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-700 dark:text-white/70">
            Decisões pendentes de autoridade. Sem autoaprovação, sem aprovação tácita —
            cada decisão fica registrada com autor, horário e comentário.
          </p>
        </header>

        <nav className="flex gap-1 border-b border-surface-200 dark:border-navy-700">
          {tabs.map((t) => (
            <Link
              key={t}
              href={`/aprovacoes?state=${t}`}
              aria-current={state === t ? 'page' : undefined}
              className={[
                'border-b-2 px-3 py-2 text-xs font-medium uppercase tracking-wider transition-colors',
                state === t
                  ? 'border-accent text-accent'
                  : 'border-transparent text-ink-500 hover:text-ink-900 dark:hover:text-white',
              ].join(' ')}
            >
              {t.toLowerCase()}
            </Link>
          ))}
        </nav>

        {items.length === 0 ? (
          <div className="rounded-card border border-dashed border-surface-200 p-8 text-center text-sm text-ink-500 dark:border-navy-700">
            Nada em <strong>{state.toLowerCase()}</strong>.
          </div>
        ) : (
          <div className="overflow-hidden rounded-card border border-surface-200 bg-surface-card shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 text-left text-[11px] uppercase tracking-wider text-ink-500 dark:border-navy-700">
                  <th className="px-4 py-2.5">Objeto</th>
                  <th className="px-4 py-2.5">Motivo</th>
                  <th className="px-4 py-2.5 text-right">Valor</th>
                  <th className="px-4 py-2.5">Progresso</th>
                  <th className="px-4 py-2.5">Aberto em</th>
                  <th className="px-4 py-2.5">Estado</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-200 dark:divide-navy-700">
                {items.map((a) => (
                  <tr key={a.id} className="hover:bg-surface-100/50 dark:hover:bg-navy-800/50">
                    <td className="px-4 py-2.5">
                      <div className="text-ink-900 dark:text-white">
                        {SUBJECT_LABEL[a.subjectType] ?? a.subjectType}
                      </div>
                      <div className="font-mono text-[10px] text-ink-500">
                        {a.subjectId.slice(0, 8)}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-ink-700 dark:text-white/90 max-w-[320px]">
                      <div className="truncate" title={a.reason}>
                        {a.reason}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-900 dark:text-white">
                      {a.amountCents ? formatCents(a.amountCents, a.currency ?? 'BRL') : '—'}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-ink-500">
                      {a.approvalsReceived}/{a.requiredApprovals}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-ink-500">
                      {formatIsoDate(a.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={STATE_TONE[a.state] ?? 'neutral'}>
                        {a.state.toLowerCase().replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        href={`/aprovacoes/${a.id}`}
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
      </div>
    </AppShell>
  );
}
