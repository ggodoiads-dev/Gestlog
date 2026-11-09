'use server';

import crypto from 'node:crypto';

import { revalidatePath } from 'next/cache';

import { ApiError, apiFetch } from './api';

export interface RegisterReceiptState {
  success?: {
    receiptId: string;
    allocationCents: string;
    balanceCents: string;
    status: string;
    wasDeduped: boolean;
  };
  error?: string;
}

export async function registerReceiptAction(
  _prev: RegisterReceiptState,
  formData: FormData,
): Promise<RegisterReceiptState> {
  const receivableId = String(formData.get('receivableId') ?? '');
  const amountReais = String(formData.get('amount') ?? '').trim();
  const source = String(formData.get('source') ?? 'MANUAL');
  const reference = String(formData.get('reference') ?? '').trim();
  const receivedAt = String(formData.get('receivedAt') ?? '').trim();

  if (!receivableId) return { error: 'recebível inválido.' };
  if (!amountReais) return { error: 'informe o valor.' };

  // Converte R$ 1.234,56 (ou 1234.56) para centavos exatos.
  const normalized = amountReais.replace(/\./g, '').replace(',', '.');
  const asNumber = Number.parseFloat(normalized);
  if (!Number.isFinite(asNumber) || asNumber <= 0) {
    return { error: 'valor inválido.' };
  }
  const cents = BigInt(Math.round(asNumber * 100));

  // Idempotency-Key gerada server-side por submissão. Garante que
  // double-click do usuário ou retry do navegador não duplica.
  const idemKey = `web-${crypto.randomBytes(12).toString('hex')}`;

  try {
    const res = await apiFetch<{
      receiptId: string;
      allocationCents: string;
      wasDeduped: boolean;
      receivable: { balanceCents: string; status: string };
    }>(`/v1/receivables/${receivableId}/receipts`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idemKey },
      body: {
        amountCents: cents.toString(),
        source,
        ...(receivedAt ? { receivedAt: `${receivedAt}T00:00:00Z` } : {}),
        ...(reference ? { reference } : {}),
      },
    });
    revalidatePath(`/recebiveis/${receivableId}`);
    revalidatePath('/recebiveis');
    return {
      success: {
        receiptId: res.receiptId,
        allocationCents: res.allocationCents,
        balanceCents: res.receivable.balanceCents,
        status: res.receivable.status,
        wasDeduped: res.wasDeduped,
      },
    };
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: `${err.status}: ${err.message}` };
    }
    return { error: 'falha inesperada ao registrar pagamento.' };
  }
}
