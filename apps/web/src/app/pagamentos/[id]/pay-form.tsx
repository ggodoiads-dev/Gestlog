'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { formatCents } from '@/lib/format';
import { payPayableAction } from '@/lib/payment-actions';

function SubmitButton(): React.ReactElement {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center justify-center rounded-control bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
    >
      {pending ? 'Executando…' : 'Executar pagamento'}
    </button>
  );
}

export function PayForm({
  payableId,
  balanceCents,
  currency,
}: {
  payableId: string;
  balanceCents: string;
  currency: string;
}): React.ReactElement {
  const [state, action] = useActionState(payPayableAction, {});
  const balance = (Number(BigInt(balanceCents)) / 100).toFixed(2).replace('.', ',');

  return (
    <form
      action={action}
      className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900"
    >
      <input type="hidden" name="payableId" value={payableId} />
      <div className="grid gap-4 md:grid-cols-5">
        <div className="space-y-1.5 md:col-span-2">
          <label htmlFor="amount" className="text-xs font-medium text-ink-700 dark:text-white/80">
            Valor (R$)
          </label>
          <input
            id="amount"
            name="amount"
            type="text"
            inputMode="decimal"
            required
            defaultValue={balance}
            placeholder={balance}
            className="h-10 w-full rounded-control border border-surface-200 bg-surface-0 px-3 font-mono text-sm tabular-nums text-ink-900 outline-none focus:border-accent dark:border-navy-700 dark:bg-navy-800 dark:text-white"
          />
          <p className="text-[10px] text-ink-500">saldo: {formatCents(balanceCents, currency)}</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="method" className="text-xs font-medium text-ink-700 dark:text-white/80">
            Método
          </label>
          <select
            id="method"
            name="method"
            defaultValue="MANUAL"
            className="h-10 w-full rounded-control border border-surface-200 bg-surface-0 px-3 text-sm dark:border-navy-700 dark:bg-navy-800 dark:text-white"
          >
            <option value="MANUAL">Manual</option>
            <option value="PIX">PIX</option>
            <option value="BANK_API">API bancária</option>
            <option value="OFX_IMPORT">Import OFX</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="externalStatus"
            className="text-xs font-medium text-ink-700 dark:text-white/80"
          >
            Retorno bancário
          </label>
          <select
            id="externalStatus"
            name="externalStatus"
            defaultValue="CONFIRMED"
            className="h-10 w-full rounded-control border border-surface-200 bg-surface-0 px-3 text-sm dark:border-navy-700 dark:bg-navy-800 dark:text-white"
          >
            <option value="CONFIRMED">Confirmado</option>
            <option value="PROCESSING">Processando</option>
            <option value="UNKNOWN">Desconhecido</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="paidAt" className="text-xs font-medium text-ink-700 dark:text-white/80">
            Data
          </label>
          <input
            id="paidAt"
            name="paidAt"
            type="date"
            className="h-10 w-full rounded-control border border-surface-200 bg-surface-0 px-3 text-sm dark:border-navy-700 dark:bg-navy-800 dark:text-white"
          />
        </div>
      </div>
      <div className="mt-3">
        <label htmlFor="reference" className="text-xs font-medium text-ink-700 dark:text-white/80">
          Referência
        </label>
        <input
          id="reference"
          name="reference"
          type="text"
          placeholder="TED, end-to-end, nosso número…"
          className="h-10 w-full rounded-control border border-surface-200 bg-surface-0 px-3 text-sm dark:border-navy-700 dark:bg-navy-800 dark:text-white"
        />
      </div>
      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-ink-500">
          <strong>UNKNOWN</strong> grava o fato mas não baixa saldo — nenhum retry cego.
          Idempotency-Key gerada no servidor.
        </p>
        <SubmitButton />
      </div>
      {state.success ? (
        <div
          role="status"
          className="mt-4 rounded-control border border-success-600/40 bg-success-600/5 px-3 py-2 text-xs text-success-600"
        >
          {state.success.wasDeduped ? 'Pagamento já registrado' : 'Pagamento registrado'} ·
          retorno <strong>{state.success.externalStatus.toLowerCase()}</strong> · payable →{' '}
          <strong>{state.success.status.toLowerCase().replace('_', ' ')}</strong> · saldo{' '}
          {formatCents(state.success.balanceCents, currency)}.
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
