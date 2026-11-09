import { cookies } from 'next/headers';

const SESSION_COOKIE = 'gestlog_session';
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60; // 8h

export interface Session {
  accessToken: string;
  userId: string;
  tenantId: string;
  roles: string[];
  permissions: string[];
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as Session;
  } catch {
    return null;
  }
}

export async function setSession(session: Session): Promise<void> {
  const value = Buffer.from(JSON.stringify(session), 'utf-8').toString('base64');
  const store = await cookies();
  store.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export function hasPermission(session: Session | null, permission: string): boolean {
  return session?.permissions.includes(permission) ?? false;
}
