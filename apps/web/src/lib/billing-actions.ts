'use server';

import { revalidatePath } from 'next/cache';

import { ApiError, apiFetch } from './api';

export interface IssueReceivableState {
  success?: {
    id: string;
    amountCents: string;
    currency: string;
    dueDate: string;
    wasAlreadyIssued: boolean;
  };
  error?: string;
}

export async function issueReceivableAction(
  _prev: IssueReceivableState,
  formData: FormData,
): Promise<IssueReceivableState> {
  const contractId = String(formData.get('contractId') ?? '');
  const competenceYear = Number(formData.get('competenceYear'));
  const competenceMonth = Number(formData.get('competenceMonth'));
  const dueDate = String(formData.get('dueDate') ?? '');

  if (!contractId) return { error: 'contrato inválido.' };
  if (!Number.isInteger(competenceYear) || !Number.isInteger(competenceMonth)) {
    return { error: 'competência inválida.' };
  }

  try {
    const body: Record<string, unknown> = { competenceYear, competenceMonth };
    if (dueDate) body.dueDate = dueDate;
    const res = await apiFetch<{
      id: string;
      amountCents: string;
      currency: string;
      dueDate: string;
      wasAlreadyIssued: boolean;
    }>(`/v1/billing/pre-invoices/${contractId}/issue`, {
      method: 'POST',
      body,
    });
    revalidatePath(`/contratos/${contractId}`);
    revalidatePath('/recebiveis');
    return {
      success: {
        id: res.id,
        amountCents: res.amountCents,
        currency: res.currency,
        dueDate: res.dueDate,
        wasAlreadyIssued: res.wasAlreadyIssued,
      },
    };
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: `${err.status}: ${err.message}` };
    }
    return { error: 'falha inesperada ao emitir recebível.' };
  }
}
