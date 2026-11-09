'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { ApiError, apiFetch } from './api';

export async function matchTransactionAction(formData: FormData): Promise<void> {
  const transactionId = String(formData.get('transactionId') ?? '');
  const kind = String(formData.get('kind') ?? '');
  const partnerId = String(formData.get('partnerId') ?? '');
  if (!transactionId || !kind || !partnerId) return;
  const body = kind === 'receipt' ? { receiptId: partnerId } : { paymentId: partnerId };
  try {
    await apiFetch(`/v1/bank-transactions/${transactionId}/match`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (err instanceof ApiError) {
      console.error('match failed:', err.status, err.message);
    } else {
      console.error('match failed:', err);
    }
    return;
  }
  revalidatePath('/tesouraria');
  redirect('/tesouraria');
}

export async function unmatchTransactionAction(formData: FormData): Promise<void> {
  const transactionId = String(formData.get('transactionId') ?? '');
  if (!transactionId) return;
  try {
    await apiFetch(`/v1/bank-transactions/${transactionId}/unmatch`, {
      method: 'POST',
    });
  } catch (err) {
    console.error('unmatch failed:', err);
    return;
  }
  revalidatePath('/tesouraria');
  redirect('/tesouraria');
}
