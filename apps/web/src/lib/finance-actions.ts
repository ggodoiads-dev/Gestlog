'use server';

import { revalidatePath } from 'next/cache';

import { ApiError, apiFetch } from './api';

export interface ClosePeriodState {
  success?: { state: string; ebitdaCents: string; snapshots: number };
  error?: string;
}

export async function closePeriodAction(
  _: ClosePeriodState,
  formData: FormData,
): Promise<ClosePeriodState> {
  const legalEntityId = String(formData.get('legalEntityId') ?? '');
  const year = Number(formData.get('year'));
  const month = Number(formData.get('month'));
  if (!legalEntityId || !Number.isInteger(year) || !Number.isInteger(month)) {
    return { error: 'parâmetros inválidos.' };
  }
  try {
    const res = await apiFetch<{
      period: { state: string };
      ebitdaCents: string;
      snapshots: { version: number }[];
    }>(`/v1/finance/periods/${legalEntityId}/${year}/${month}/close`, { method: 'POST' });
    revalidatePath('/dre');
    return {
      success: {
        state: res.period.state,
        ebitdaCents: res.ebitdaCents,
        snapshots: res.snapshots.length,
      },
    };
  } catch (err) {
    if (err instanceof ApiError) return { error: `${err.status}: ${err.message}` };
    return { error: 'falha inesperada ao fechar competência.' };
  }
}

export interface ReopenPeriodState {
  success?: { state: string };
  error?: string;
}

export async function reopenPeriodAction(
  _: ReopenPeriodState,
  formData: FormData,
): Promise<ReopenPeriodState> {
  const legalEntityId = String(formData.get('legalEntityId') ?? '');
  const year = Number(formData.get('year'));
  const month = Number(formData.get('month'));
  const reason = String(formData.get('reason') ?? '').trim();
  if (!reason || reason.length < 3) return { error: 'motivo obrigatório (mín. 3 caracteres).' };
  try {
    const res = await apiFetch<{ period: { state: string } }>(
      `/v1/finance/periods/${legalEntityId}/${year}/${month}/reopen`,
      { method: 'POST', body: { reason } },
    );
    revalidatePath('/dre');
    return { success: { state: res.period.state } };
  } catch (err) {
    if (err instanceof ApiError) return { error: `${err.status}: ${err.message}` };
    return { error: 'falha inesperada ao reabrir competência.' };
  }
}
