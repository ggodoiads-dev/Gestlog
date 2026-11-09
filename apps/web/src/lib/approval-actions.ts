'use server';

import { revalidatePath } from 'next/cache';

import { ApiError, apiFetch } from './api';

export interface DecideState {
  success?: { state: string; approvalsReceived: number };
  error?: string;
}

async function decide(
  approvalId: string,
  decision: 'APPROVE' | 'REJECT' | 'RETURN',
  comment: string,
): Promise<DecideState> {
  if (!approvalId) return { error: 'pedido inválido.' };
  try {
    const res = await apiFetch<{ state: string; approvalsReceived: number }>(
      `/v1/approvals/${approvalId}/decisions`,
      {
        method: 'POST',
        body: {
          decision,
          ...(comment.trim().length > 0 ? { comment: comment.trim() } : {}),
        },
      },
    );
    revalidatePath('/aprovacoes');
    revalidatePath(`/aprovacoes/${approvalId}`);
    return { success: { state: res.state, approvalsReceived: res.approvalsReceived } };
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: `${err.status}: ${err.message}` };
    }
    return { error: 'falha inesperada ao registrar decisão.' };
  }
}

export async function approveAction(_: DecideState, formData: FormData): Promise<DecideState> {
  return decide(
    String(formData.get('approvalId') ?? ''),
    'APPROVE',
    String(formData.get('comment') ?? ''),
  );
}

export async function rejectAction(_: DecideState, formData: FormData): Promise<DecideState> {
  return decide(
    String(formData.get('approvalId') ?? ''),
    'REJECT',
    String(formData.get('comment') ?? ''),
  );
}

export async function returnAction(_: DecideState, formData: FormData): Promise<DecideState> {
  return decide(
    String(formData.get('approvalId') ?? ''),
    'RETURN',
    String(formData.get('comment') ?? ''),
  );
}

export async function cancelApprovalAction(
  _: DecideState,
  formData: FormData,
): Promise<DecideState> {
  const id = String(formData.get('approvalId') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  if (!reason || reason.length < 3) return { error: 'motivo obrigatório (mín. 3 caracteres).' };
  try {
    const res = await apiFetch<{ state: string; approvalsReceived: number }>(
      `/v1/approvals/${id}?reason=${encodeURIComponent(reason)}`,
      { method: 'DELETE' },
    );
    revalidatePath('/aprovacoes');
    revalidatePath(`/aprovacoes/${id}`);
    return { success: { state: res.state, approvalsReceived: res.approvalsReceived } };
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: `${err.status}: ${err.message}` };
    }
    return { error: 'falha inesperada ao cancelar.' };
  }
}
