'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import {
  approveAction,
  cancelApprovalAction,
  rejectAction,
  returnAction,
} from '@/lib/approval-actions';

function Spinner({ label }: { label: string }): React.ReactElement {
  const { pending } = useFormStatus();
  return <>{pending ? 'enviando…' : label}</>;
}

function DecisionForm({
  approvalId,
  decision,
  label,
  tone,
}: {
  approvalId: string;
  decision: 'APPROVE' | 'REJECT' | 'RETURN';
  label: string;
  tone: 'success' | 'danger' | 'warning';
}): React.ReactElement {
  const action =
    decision === 'APPROVE' ? approveAction : decision === 'REJECT' ? rejectAction : returnAction;
  const [state, submit] = useActionState(action, {});
  const btn =
    tone === 'success'
      ? 'bg-success-600 hover:brightness-110 text-white'
      : tone === 'danger'
        ? 'bg-danger-600 hover:brightness-110 text-white'
        : 'bg-warning-600 hover:brightness-110 text-white';

  return (
    <form
      action={submit}
      className="rounded-card border border-surface-200 bg-surface-card p-4 shadow-sm dark:border-navy-700 dark:bg-navy-900"
    >
      <input type="hidden" name="approvalId" value={approvalId} />
      <label
        htmlFor={`comment-${decision}`}
        className="text-[11px] font-medium uppercase tracking-wider text-ink-500"
      >
        {label}
      </label>
      <textarea
        id={`comment-${decision}`}
        name="comment"
        rows={2}
        placeholder={
          decision === 'REJECT'
            ? 'motivo (obrigatório na prática — documenta a trilha)'
            : 'comentário (opcional)'
        }
        className="mt-1 w-full rounded-control border border-surface-200 bg-surface-0 px-2 py-1 text-sm dark:border-navy-700 dark:bg-navy-800 dark:text-white"
      />
      <SubmitInline tone={btn} label={label} />
      {state.success ? (
        <div className="mt-2 rounded-control border border-success-600/40 bg-success-600/5 px-2 py-1 text-xs text-success-600">
          Decisão registrada. Estado → <strong>{state.success.state.toLowerCase()}</strong>.
        </div>
      ) : null}
      {state.error ? (
        <div className="mt-2 rounded-control border border-danger-600/40 bg-danger-600/5 px-2 py-1 text-xs text-danger-600">
          {state.error}
        </div>
      ) : null}
    </form>
  );
}

function SubmitInline({ tone, label }: { tone: string; label: string }): React.ReactElement {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`mt-2 inline-flex h-9 w-full items-center justify-center rounded-control px-3 text-xs font-medium transition disabled:opacity-60 ${tone}`}
    >
      {pending ? 'enviando…' : label}
    </button>
  );
}

export function DecisionBar({ approvalId }: { approvalId: string }): React.ReactElement {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <DecisionForm approvalId={approvalId} decision="APPROVE" label="Aprovar" tone="success" />
      <DecisionForm approvalId={approvalId} decision="RETURN" label="Devolver" tone="warning" />
      <DecisionForm approvalId={approvalId} decision="REJECT" label="Rejeitar" tone="danger" />
    </div>
  );
}

export function CancelForm({ approvalId }: { approvalId: string }): React.ReactElement {
  const [state, submit] = useActionState(cancelApprovalAction, {});
  return (
    <form action={submit} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="approvalId" value={approvalId} />
      <div className="flex-1 min-w-[200px]">
        <label htmlFor="reason" className="text-[11px] text-ink-500">
          motivo do cancelamento
        </label>
        <input
          id="reason"
          name="reason"
          required
          minLength={3}
          placeholder="ex.: mudança de escopo"
          className="h-8 w-full rounded-control border border-surface-200 bg-surface-0 px-2 text-xs dark:border-navy-700 dark:bg-navy-800 dark:text-white"
        />
      </div>
      <button
        type="submit"
        className="h-8 rounded-control border border-ink-700/30 px-3 text-xs font-medium text-ink-700 hover:bg-surface-100 dark:border-white/20 dark:text-white dark:hover:bg-navy-800"
      >
        <Spinner label="cancelar pedido" />
      </button>
      {state.success ? (
        <div className="basis-full rounded-control border border-success-600/40 bg-success-600/5 px-2 py-1 text-xs text-success-600">
          Cancelado.
        </div>
      ) : null}
      {state.error ? (
        <div className="basis-full rounded-control border border-danger-600/40 bg-danger-600/5 px-2 py-1 text-xs text-danger-600">
          {state.error}
        </div>
      ) : null}
    </form>
  );
}
