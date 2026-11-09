import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { Badge } from '@gestlog/ui';

import { AppShell } from '@/components/app-shell';
import { ApiError, apiFetch } from '@/lib/api';
import { formatCents, formatIsoDate } from '@/lib/format';
import { getSession, hasPermission } from '@/lib/session';
import { DecisionBar } from './decision-bar';

interface ApprovalDetail {
  id: string;
  subjectType: string;
  subjectId: string;
  subjectVersion: number;
  state: 'PENDING' | 'APPROVED' | 'REJECTED' | 'RETURNED' | 'CANCELLED' | 'SUPERSEDED';
  requiredApprovals: number;
  approvalsReceived: number;
  reason: string;
  amountCents: string | null;
  currency: string | null;
  requestedBy: string;
  createdAt: string;
  decidedAt: string | null;
  steps: {
    approverId: string;
    decision: 'APPROVE' | 'REJECT' | 'RETURN';
    comment: string | null;
    decidedAt: string;
  }[];
}

const STATE_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  RETURNED: 'info',
  CANCELLED: 'neutral',
  SUPERSEDED: 'neutral',
};

const DECISION_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  APPROVE: 'success',
  REJECT: 'danger',
  RETURN: 'warning',
};

export default async function AprovacaoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect('/login');
  const { id } = await params;

  let approval: ApprovalDetail;
  try {
    approval = await apiFetch<ApprovalDetail>(`/v1/approvals/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const me = await apiFetch<{ tenant: { name: string } }>('/v1/me');

  const isPending = approval.state === 'PENDING';
  const canDecide = hasPermission(session, 'governance.approvals.decide');
  const canCancel = hasPermission(session, 'governance.approvals.request');
  const isRequester = approval.requestedBy === session.userId;
  const hasAlreadyVoted = approval.steps.some((s) => s.approverId === session.userId);

  // Fonte única da verdade sobre quem pode decidir aqui. O backend valida
  // de novo quando a decisão chega.
  const decisionBlockedReason = !isPending
    ? `pedido ${approval.state.toLowerCase()} — decisão encerrada`
    : !canDecide
      ? 'seu perfil não tem permissão governance.approvals.decide'
      : isRequester
        ? 'autoaprovação proibida — você abriu este pedido'
        : hasAlreadyVoted
          ? 'você já decidiu este pedido'
          : null;

  return (
    <AppShell session={session} tenantName={me.tenant.name} activePath="/aprovacoes">
      <div className="space-y-6">
        <nav className="text-xs text-ink-500">
          <Link href="/aprovacoes" className="hover:text-accent">
            Aprovações
          </Link>{' '}
          /{' '}
          <span className="font-mono">
            {approval.subjectType} · {approval.subjectId.slice(0, 8)}
          </span>
        </nav>

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge tone={STATE_TONE[approval.state] ?? 'neutral'}>
                {approval.state.toLowerCase().replace('_', ' ')}
              </Badge>
              <span className="text-xs text-ink-500">
                aberto em {formatIsoDate(approval.createdAt)} · {approval.approvalsReceived}/
                {approval.requiredApprovals} aprovação(ões)
                {approval.decidedAt ? ` · decidido em ${formatIsoDate(approval.decidedAt)}` : ''}
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-ink-900 dark:text-white">
              {approval.reason}
            </h1>
            <p className="mt-1 text-sm text-ink-700 dark:text-white/70">
              Tipo <span className="font-mono">{approval.subjectType}</span> · snapshot v
              {approval.subjectVersion}
            </p>
          </div>
          {approval.amountCents ? (
            <div className="min-w-[200px] rounded-card border border-surface-200 bg-surface-card p-4 text-right shadow-sm dark:border-navy-700 dark:bg-navy-900">
              <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
                Valor envolvido
              </div>
              <div className="mt-1 font-mono text-2xl font-semibold text-ink-900 tabular-nums dark:text-white">
                {formatCents(approval.amountCents, approval.currency ?? 'BRL')}
              </div>
            </div>
          ) : null}
        </header>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
            Decisão
          </h2>
          {decisionBlockedReason ? (
            <div className="rounded-card border border-dashed border-surface-200 p-6 text-sm text-ink-500 dark:border-navy-700">
              {decisionBlockedReason}
              {isPending && isRequester && canCancel ? (
                <div className="mt-3">
                  <CancelAttachedForm approvalId={approval.id} />
                </div>
              ) : null}
            </div>
          ) : (
            <DecisionBar approvalId={approval.id} />
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
            Trilha de decisões
          </h2>
          {approval.steps.length === 0 ? (
            <div className="rounded-card border border-dashed border-surface-200 p-6 text-sm text-ink-500 dark:border-navy-700">
              Nenhuma decisão ainda.
            </div>
          ) : (
            <div className="overflow-hidden rounded-card border border-surface-200 bg-surface-card shadow-sm dark:border-navy-700 dark:bg-navy-900">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 text-left text-[11px] uppercase tracking-wider text-ink-500 dark:border-navy-700">
                    <th className="px-4 py-2.5">Decisão</th>
                    <th className="px-4 py-2.5">Aprovador</th>
                    <th className="px-4 py-2.5">Comentário</th>
                    <th className="px-4 py-2.5">Em</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-200 dark:divide-navy-700">
                  {approval.steps.map((s) => (
                    <tr key={s.approverId + s.decidedAt}>
                      <td className="px-4 py-2.5">
                        <Badge tone={DECISION_TONE[s.decision] ?? 'neutral'}>
                          {s.decision.toLowerCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[10px] text-ink-500">
                        {s.approverId.slice(0, 8)}
                      </td>
                      <td className="px-4 py-2.5 text-ink-700 dark:text-white/90">
                        {s.comment ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-ink-500">
                        {formatIsoDate(s.decidedAt)}
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

function CancelAttachedForm({ approvalId }: { approvalId: string }): React.ReactElement {
  // Client component embarcado via import para não forçar mais um arquivo.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { CancelForm } = require('./decision-bar') as {
    CancelForm: (props: { approvalId: string }) => React.ReactElement;
  };
  return <CancelForm approvalId={approvalId} />;
}
