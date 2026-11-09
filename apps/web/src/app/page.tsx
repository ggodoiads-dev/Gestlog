import { DemoBanner } from '@gestlog/ui';
import { redirect } from 'next/navigation';

import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

interface Me {
  tenant: { id: string; slug: string; name: string };
  user: { id: string; email: string; fullName: string };
  roles: string[];
  permissions: string[];
}

export default async function HomePage(): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect('/login');

  const me = await apiFetch<Me>('/v1/me');
  const [{ items: routes }, { items: vehicles }, { items: drivers }, { items: clients }] =
    await Promise.all([
      apiFetch<{ items: unknown[] }>('/v1/routes'),
      apiFetch<{ items: unknown[] }>('/v1/vehicles'),
      apiFetch<{ items: unknown[] }>('/v1/drivers'),
      apiFetch<{ items: unknown[] }>('/v1/clients'),
    ]);

  const metrics = [
    { label: 'Clientes ativos', value: clients.length },
    { label: 'Rotas cadastradas', value: routes.length },
    { label: 'Veículos', value: vehicles.length },
    { label: 'Motoristas', value: drivers.length },
  ];

  return (
    <AppShell session={session} tenantName={me.tenant.name} activePath="/">
      <div className="space-y-6">
        <header className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-widest text-ink-500">
            Visão geral
          </span>
          <h1 className="text-2xl font-semibold text-ink-900 dark:text-white">
            Olá, {me.user.fullName}.
          </h1>
          <p className="text-sm text-ink-700 dark:text-white/70">
            Central de comando da transportadora. Este dashboard ainda é um esboço — as
            métricas reais (EBITDA, captura anual, saúde operacional) chegam nas próximas
            fatias.
          </p>
        </header>

        <DemoBanner
          module="Dashboard executivo"
          reason="Métricas são contagens diretas dos endpoints de domínio. KPIs financeiros virão quando Finance estiver homologado."
        />

        <section className="grid gap-4 md:grid-cols-4">
          {metrics.map((m) => (
            <article
              key={m.label}
              className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900"
            >
              <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
                {m.label}
              </div>
              <div className="mt-2 font-mono text-3xl font-semibold text-ink-900 tabular-nums dark:text-white">
                {m.value}
              </div>
              <div className="mt-1 text-xs text-ink-500">fonte: API · agora</div>
            </article>
          ))}
        </section>

        <section className="rounded-card border border-surface-200 bg-surface-card p-6 shadow-sm dark:border-navy-700 dark:bg-navy-900">
          <h2 className="text-lg font-semibold text-ink-900 dark:text-white">Próximas ações</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-700 dark:text-white/80">
            <li>• Criar uma rota, publicar versão e expandir viagens em <strong>Operações → Rotagrama</strong>.</li>
            <li>• Cadastrar veículos (Frota) e motoristas (Pessoas) para habilitar designação.</li>
            <li>• Próxima fatia do produto: faturamento + DRE.</li>
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
