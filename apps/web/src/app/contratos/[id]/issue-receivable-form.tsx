'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { issueReceivableAction } from '@/lib/billing-actions';
import { formatCents, formatIsoDate } from '@/lib/format';

function SubmitButton(): React.ReactElement {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center justify-center rounded-control bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
    >
      {pending ? 'Emitindo…' : 'Emitir recebível'}
    </button>
  );
}

export function IssueReceivableForm({
  contractId,
  competenceYear,
  competenceMonth,
  totalAmountCents,
  currency,
}: {
  contractId: string;
  competenceYear: number;
  competenceMonth: number;
  totalAmountCents: string;
  currency: string;
}): React.ReactElement {
  const [state, action] = useActionState(issueReceivableAction, {});

  return (
    <form
      action={action}
      className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900"
    >
      <input type="hidden" name="contractId" value={contractId} />
      <input type="hidden" name="competenceYear" value={competenceYear} />
      <input type="hidden" name="competenceMonth" value={competenceMonth} />
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
            Emitir recebível desta pré-fatura
          </div>
          <div className="mt-1 font-mono text-xl font-semibold text-ink-900 tabular-nums dark:text-white">
            {formatCents(totalAmountCents, currency)}
          </div>
          <div className="mt-1 text-xs text-ink-500">
            Re-emitir a mesma competência retorna o mesmo recebível (idempotente).
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <label htmlFor="dueDate" className="text-ink-500">
            vencimento
          </label>
          <input
            id="dueDate"
            name="dueDate"
            type="date"
            className="h-9 rounded-control border border-surface-200 bg-surface-0 px-2 dark:border-navy-700 dark:bg-navy-800 dark:text-white"
          />
        </div>
        <SubmitButton />
      </div>

      {state.success ? (
        <div
          role="status"
          className="mt-4 rounded-control border border-success-600/40 bg-success-600/5 px-3 py-2 text-xs text-success-600"
        >
          {state.success.wasAlreadyIssued ? 'Recebível já existia' : 'Recebível emitido'}:
          {' '}
          {formatCents(state.success.amountCents, state.success.currency)} com vencimento{' '}
          {formatIsoDate(state.success.dueDate)}.
        </div>
      ) : null}
      {state.error ? (
        <div
          role="alert"
          className="mt-4 rounded-control border border-danger-600/40 bg-danger-600/5 px-3 py-2 text-xs text-danger-600"
        >
          {state.error}
        </div>
      ) : null}
    </form>
  );
}
