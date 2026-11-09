/**
 * Result para erros esperados de domínio (regra de negócio não satisfeita).
 * Erros inesperados continuam sendo throw.
 */
export type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
