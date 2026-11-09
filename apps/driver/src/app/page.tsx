import { DemoBanner } from '@gestlog/ui';

export default function DriverHome(): JSX.Element {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-5 py-8">
      <header className="flex items-center justify-between">
        <span className="font-mono text-xs tracking-wider text-ink-500">GESTLOG DRIVER</span>
        <span className="text-xs text-ink-500">offline-first · v0.0.0</span>
      </header>

      <h1 className="text-3xl font-semibold leading-tight text-ink-900 dark:text-white">
        Próxima obrigação em breve.
      </h1>

      <DemoBanner
        module="Driver"
        reason="PWA em construção. Login seguro, checklist por custódia, fila idempotente e sincronização virão nos próximos commits."
      />

      <section className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
        <h2 className="text-lg font-semibold">O que vem aqui:</h2>
        <ul className="mt-2 space-y-1 text-sm text-ink-700 dark:text-white/80">
          <li>• Botão grande de apresentação / posicionamento / início de viagem</li>
          <li>• Checklist por nova custódia</li>
          <li>• Reportar ocorrência e avaria com poucos toques</li>
          <li>• Banner claro de estado offline/sincronização</li>
        </ul>
      </section>
    </main>
  );
}
