'use server';

import { revalidatePath } from 'next/cache';

import { ApiError, apiFetch } from './api';

export interface ReceiveState {
  success?: { receiptId: string; status: string; remainingCents: string };
  error?: string;
}

function reaisToCents(raw: string): bigint | null {
  const normalized = raw.replace(/\./g, '').replace(',', '.');
  const n = Number.parseFloat(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return BigInt(Math.round(n * 100));
}

export async function receiveOrderAction(
  _: ReceiveState,
  formData: FormData,
): Promise<ReceiveState> {
  const orderId = String(formData.get('orderId') ?? '');
  const amount = String(formData.get('amount') ?? '').trim();
  const reference = String(formData.get('reference') ?? '').trim();
  const receivedAt = String(formData.get('receivedAt') ?? '').trim();

  if (!orderId) return { error: 'pedido inválido.' };
  const cents = reaisToCents(amount);
  if (cents === null) return { error: 'valor inválido.' };

  try {
    const res = await apiFetch<{
      receiptId: string;
      order: { status: string; remainingCents: string };
    }>(`/v1/purchase-orders/${orderId}/receipts`, {
      method: 'POST',
      body: {
        amountCents: cents.toString(),
        ...(receivedAt ? { receivedAt: `${receivedAt}T00:00:00Z` } : {}),
        ...(reference ? { reference } : {}),
      },
    });
    revalidatePath(`/compras/${orderId}`);
    revalidatePath('/compras');
    return {
      success: {
        receiptId: res.receiptId,
        status: res.order.status,
        remainingCents: res.order.remainingCents,
      },
    };
  } catch (err) {
    if (err instanceof ApiError) return { error: `${err.status}: ${err.message}` };
    return { error: 'falha inesperada ao registrar recebimento.' };
  }
}
