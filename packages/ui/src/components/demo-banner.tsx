/**
 * Banner exibido em todo lugar onde um módulo depende de integração ainda
 * não homologada, OU usa dados de seed marcados __demo__.
 *
 * Nunca mostre dados fictícios como se fossem produção — ver
 * docs/INTEGRATION_CONTRACTS.md §4.
 */
export function DemoBanner({
  module,
  reason,
}: {
  module: string;
  reason: string;
}): JSX.Element {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-card border border-warning-600/40 bg-warning-600/5 px-4 py-3 text-sm text-warning-600"
    >
      <span aria-hidden className="mt-0.5 inline-block h-2 w-2 rounded-full bg-warning-600" />
      <div>
        <strong className="font-semibold">Modo demo — {module}.</strong>{' '}
        <span className="text-ink-700 dark:text-white/80">{reason}</span>
      </div>
    </div>
  );
}
