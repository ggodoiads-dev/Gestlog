'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { formatCents } from '@/lib/format';
import { receiveOrderAction } from '@/lib/procurement-actions';

function SubmitButton(): React.ReactElement {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center justify-center rounded-control bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
    >
      {pending ? 'Registrando…' : 'Registrar recebimento'}
    </button>
  );
}

export function ReceiveForm({
  orderId,
  remainingCents,
  currency,
}: {
  orderId: string;
  remainingCents: string;
  currency: string;
}): React.ReactElement {
  const [state, action] = useActionState(receiveOrderAction, {});
  const remaining = (Number(BigInt(remainingCents)) / 100).toFixed(2).replace('.', ',');

  return (
    <form
      action={action}
      className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <label htmlFor="amount" className="text-xs font-medium text-ink-700 dark:text-white/80">
            Valor recebido (R$)
          </label>
          <input
            id="amount"
            name="amount"
            type="text"
            inputMode="decimal"
            required
            defaultValue={remaining}
            placeholder={remaining}
            className="h-10 w-full rounded-control border border-surface-200 bg-surface-0 px-3 font-mono text-sm tabular-nums text-ink-900 outline-none focus:border-accent dark:border-navy-700 dark:bg-navy-800 dark:text-white"
          />
          <p className="text-[10px] text-ink-500">
            restante: {formatCents(remainingCents, currency)}
          </p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="receivedAt" className="text-xs font-medium text-ink-700 dark:text-white/80">
            Recebido em
          </label>
          <input
            id="receivedAt"
            name="receivedAt"
            type="date"
            className="h-10 w-full rounded-control border border-surface-200 bg-surface-0 px-3 text-sm dark:border-navy-700 dark:bg-navy-800 dark:text-white"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="reference" className="text-xs font-medium text-ink-700 dark:text-white/80">
            Referência (NF, romaneio)
          </label>
          <input
            id="reference"
            name="reference"
            type="text"
            placeholder="NF 123, ROM 45..."
            className="h-10 w-full rounded-control border border-surface-200 bg-surface-0 px-3 text-sm dark:border-navy-700 dark:bg-navy-800 dark:text-white"
          />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-ink-500">
          O recebimento vai alimentar o 3-way: só é possível faturar o que foi recebido.
        </p>
        <SubmitButton />
      </div>
      {state.success ? (
        <div
          role="status"
          className="mt-4 rounded-control border border-success-600/40 bg-success-600/5 px-3 py-2 text-xs text-success-600"
        >
          Recebimento registrado. Pedido → <strong>{state.success.status.toLowerCase().replace('_', ' ')}</strong>
          . Restante: {formatCents(state.success.remainingCents, currency)}.
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
