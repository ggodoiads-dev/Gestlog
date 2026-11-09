'use server';

import crypto from 'node:crypto';

import { revalidatePath } from 'next/cache';

import { ApiError, apiFetch } from './api';

export interface PayPayableState {
  success?: {
    paymentId: string;
    externalStatus: string;
    balanceCents: string;
    status: string;
    wasDeduped: boolean;
  };
  error?: string;
}

function reaisToCents(raw: string): bigint | null {
  const normalized = raw.replace(/\./g, '').replace(',', '.');
  const n = Number.parseFloat(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return BigInt(Math.round(n * 100));
}

export async function payPayableAction(
  _: PayPayableState,
  formData: FormData,
): Promise<PayPayableState> {
  const payableId = String(formData.get('payableId') ?? '');
  const amount = String(formData.get('amount') ?? '').trim();
  const method = String(formData.get('method') ?? 'MANUAL') as
    | 'MANUAL'
    | 'BANK_API'
    | 'PIX'
    | 'OFX_IMPORT';
  const externalStatus = String(formData.get('externalStatus') ?? 'CONFIRMED') as
    | 'CONFIRMED'
    | 'PROCESSING'
    | 'UNKNOWN';
  const reference = String(formData.get('reference') ?? '').trim();
  const paidAt = String(formData.get('paidAt') ?? '').trim();

  if (!payableId) return { error: 'conta a pagar inválida.' };
  const cents = reaisToCents(amount);
  if (cents === null) return { error: 'valor inválido.' };

  const idemKey = `web-pay-${crypto.randomBytes(12).toString('hex')}`;

  try {
    const res = await apiFetch<{
      paymentId: string;
      externalStatus: string;
      payable: { balanceCents: string; status: string };
      wasDeduped: boolean;
    }>(`/v1/payables/${payableId}/payments`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idemKey },
      body: {
        amountCents: cents.toString(),
        method,
        externalStatus,
        ...(paidAt ? { paidAt: `${paidAt}T12:00:00Z` } : {}),
        ...(reference ? { reference } : {}),
      },
    });
    revalidatePath(`/pagamentos/${payableId}`);
    revalidatePath('/pagamentos');
    return {
      success: {
        paymentId: res.paymentId,
        externalStatus: res.externalStatus,
        balanceCents: res.payable.balanceCents,
        status: res.payable.status,
        wasDeduped: res.wasDeduped,
      },
    };
  } catch (err) {
    if (err instanceof ApiError) return { error: `${err.status}: ${err.message}` };
    return { error: 'falha inesperada ao executar pagamento.' };
  }
}
