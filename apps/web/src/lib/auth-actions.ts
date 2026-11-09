'use server';

import { redirect } from 'next/navigation';

import { env } from './env';
import { clearSession, setSession } from './session';

export interface LoginFormState {
  error?: string;
}

export async function loginAction(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'informe e-mail e senha.' };
  }

  const res = await fetch(`${env.API_BASE_URL}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });

  if (!res.ok) {
    return { error: res.status === 401 ? 'credenciais inválidas.' : 'falha ao autenticar.' };
  }
  const data = (await res.json()) as {
    accessToken: string;
    userId: string;
    tenantId: string;
    roles: string[];
    permissions: string[];
  };
  await setSession({
    accessToken: data.accessToken,
    userId: data.userId,
    tenantId: data.tenantId,
    roles: data.roles,
    permissions: data.permissions,
  });
  redirect('/');
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect('/login');
}
