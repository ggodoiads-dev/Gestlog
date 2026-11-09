import { env } from './env';
import { getSession } from './session';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
  }
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  requireAuth?: boolean;
}

/**
 * Cliente server-side para a API do GESTLOG. Cada chamada:
 *   - injeta Bearer token (quando sessão disponível)
 *   - lança `ApiError` em status >= 400
 *   - `no-store` por padrão (dados operacionais nunca cacheados)
 */
export async function apiFetch<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, requireAuth = true } = opts;
  const session = await getSession();
  if (requireAuth && !session) {
    throw new ApiError('não autenticado', 401);
  }
  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...headers,
  };
  if (body !== undefined) {
    finalHeaders['Content-Type'] = 'application/json';
  }
  if (session) {
    finalHeaders.Authorization = `Bearer ${session.accessToken}`;
  }
  const res = await fetch(`${env.API_BASE_URL}${path}`, {
    method,
    headers: finalHeaders,
    cache: 'no-store',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await res.text();
  const parsed = raw ? safeJson(raw) : null;
  if (!res.ok) {
    const message =
      (parsed && typeof parsed === 'object' && 'message' in parsed
        ? String((parsed as { message?: unknown }).message)
        : null) ?? res.statusText;
    throw new ApiError(message, res.status, parsed);
  }
  return parsed as T;
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
