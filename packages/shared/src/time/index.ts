/**
 * Instante "frescor": todo evento operacional guarda timestamp do dispositivo,
 * timestamp do servidor, precisão e nível de confiança.
 */
export interface EventTime {
  deviceTimestamp?: Date;
  serverTimestamp: Date;
  /** Em segundos; indefinido quando a fonte não informar. */
  precisionSeconds?: number;
  confidence: 'high' | 'medium' | 'low' | 'unknown';
}

/**
 * Timezone operacional padrão. Horário é SEMPRE armazenado em UTC;
 * `TZ` do processo em `America/Sao_Paulo` apenas afeta formatação.
 */
export const DEFAULT_OPERATIONAL_TZ = 'America/Sao_Paulo';

/** Formata Date para "DD/MM/AAAA HH:mm" em pt-BR, tz operacional. */
export function formatPtBrDateTime(date: Date, tz = DEFAULT_OPERATIONAL_TZ): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: tz,
  }).format(date);
}

export function formatPtBrDate(date: Date, tz = DEFAULT_OPERATIONAL_TZ): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeZone: tz,
  }).format(date);
}
