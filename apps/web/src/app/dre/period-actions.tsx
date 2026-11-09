'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { formatCents } from '@/lib/format';
import { closePeriodAction, reopenPeriodAction } from '@/lib/finance-actions';

function SubmitInline({
  label,
  tone,
}: {
  label: string;
  tone: 'accent' | 'warning';
}): React.ReactElement {
  const { pending } = useFormStatus();
  const cls =
    tone === 'warning'
      ? 'bg-warning-600 hover:brightness-110 text-white'
      : 'bg-accent hover:bg-accent-hover text-white';
  return (
    <button
      type="submit"
      disabled={pending}
      className={`h-9 rounded-control px-3 text-xs font-medium transition disabled:opacity-60 ${cls}`}
    >
      {pending ? 'enviando…' : label}
    </button>
  );
}

export function PeriodActions({
  legalEntityId,
  year,
  month,
  state,
  canClose,
  canReopen,
}: {
  legalEntityId: string;
  year: number;
  month: number;
  state: 'OPEN' | 'CLOSING' | 'CLOSED' | 'REOPENED';
  canClose: boolean;
  canReopen: boolean;
}): React.ReactElement {
  const [closeState, closeAction] = useActionState(closePeriodAction, {});
  const [reopenState, reopenAction] = useActionState(reopenPeriodAction, {});

  const canFire = state === 'OPEN' || state === 'REOPENED';

  return (
    <div className="flex flex-wrap items-end gap-2">
      {canClose && canFire ? (
        <form action={closeAction} className="flex items-end gap-2">
          <input type="hidden" name="legalEntityId" value={legalEntityId} />
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="month" value={month} />
          <SubmitInline label="Fechar competência" tone="accent" />
        </form>
      ) : null}
      {canReopen && state === 'CLOSED' ? (
        <form action={reopenAction} className="flex items-end gap-2">
          <input type="hidden" name="legalEntityId" value={legalEntityId} />
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="month" value={month} />
          <input
            type="text"
            name="reason"
            required
            minLength={3}
            placeholder="motivo da reabertura"
            className="h-9 w-56 rounded-control border border-surface-200 bg-surface-0 px-2 text-xs dark:border-navy-700 dark:bg-navy-800 dark:text-white"
          />
          <SubmitInline label="Reabrir" tone="warning" />
        </form>
      ) : null}
      {closeState.success ? (
        <div className="basis-full rounded-control border border-success-600/40 bg-success-600/5 px-2 py-1 text-xs text-success-600">
          Fechada · EBITDA {formatCents(closeState.success.ebitdaCents, 'BRL')} · snapshot v
          {closeState.success.snapshots}.
        </div>
      ) : null}
      {closeState.error ? (
        <div className="basis-full rounded-control border border-danger-600/40 bg-danger-600/5 px-2 py-1 text-xs text-danger-600">
          {closeState.error}
        </div>
      ) : null}
      {reopenState.success ? (
        <div className="basis-full rounded-control border border-success-600/40 bg-success-600/5 px-2 py-1 text-xs text-success-600">
          Reaberta · estado {reopenState.success.state.toLowerCase()}.
        </div>
      ) : null}
      {reopenState.error ? (
        <div className="basis-full rounded-control border border-danger-600/40 bg-danger-600/5 px-2 py-1 text-xs text-danger-600">
          {reopenState.error}
        </div>
      ) : null}
    </div>
  );
}
