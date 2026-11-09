/**
 * Formatadores pt-BR coerentes com o docs/DESIGN_SYSTEM.md.
 *
 * Toda célula de dinheiro passa por aqui. Consumo é SEMPRE string de
 * centavos (BigInt serializado) — nunca `number`, evitando perda de
 * precisão.
 */
const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCents(cents: string | bigint | null | undefined, currency = 'BRL'): string {
  if (cents === null || cents === undefined) return '—';
  const big = typeof cents === 'string' ? BigInt(cents) : cents;
  const value = Number(big) / 100;
  if (currency === 'BRL') return BRL.format(value);
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatIsoDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

export function formatCompetence(yearMonth: string): string {
  const [y, m] = yearMonth.split('-');
  const months = [
    'jan',
    'fev',
    'mar',
    'abr',
    'mai',
    'jun',
    'jul',
    'ago',
    'set',
    'out',
    'nov',
    'dez',
  ];
  return `${months[Number(m) - 1] ?? m}/${y}`;
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}
