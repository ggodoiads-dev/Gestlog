import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { Badge } from '@gestlog/ui';

import { AppShell } from '@/components/app-shell';
import { ApiError, apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

interface RouteDetail {
  id: string;
  code: string;
  name: string;
  direction: string;
  status: string;
  versions: {
    id: string;
    version: number;
    publishedAt: string | null;
    effectiveFrom: string;
  }[];
}

export default async function RouteDetailPage({
  params,
}: {
  params: Promise<{ routeId: string }>;
}): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect('/login');

  const { routeId } = await params;
  let route: RouteDetail;
  try {
    route = await apiFetch<RouteDetail>(`/v1/routes/${routeId}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }
  const me = await apiFetch<{ tenant: { name: string } }>('/v1/me');

  return (
    <AppShell session={session} tenantName={me.tenant.name} activePath="/rotagrama">
      <div className="space-y-6">
        <nav className="text-xs text-ink-500">
          <Link href="/rotagrama" className="hover:text-accent">
            Rotagrama
          </Link>{' '}
          / {route.code}
        </nav>
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-ink-500">{route.code}</span>
            <Badge tone={route.status === 'ACTIVE' ? 'success' : 'neutral'}>
              {route.status.toLowerCase()}
            </Badge>
            <span className="text-xs text-ink-500">sentido {route.direction}</span>
          </div>
          <h1 className="text-2xl font-semibold text-ink-900 dark:text-white">{route.name}</h1>
        </header>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
            Histórico de versões
          </h2>
          {route.versions.length === 0 ? (
            <div className="rounded-card border border-dashed border-surface-200 p-6 text-sm text-ink-500 dark:border-navy-700">
              Nenhuma versão criada. A rota está em DRAFT; a primeira versão pode ser criada por{' '}
              <code>POST /v1/routes/{route.id}/versions</code>.
            </div>
          ) : (
            <div className="overflow-hidden rounded-card border border-surface-200 bg-surface-card shadow-sm dark:border-navy-700 dark:bg-navy-900">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 text-left text-[11px] uppercase tracking-wider text-ink-500 dark:border-navy-700">
                    <th className="px-4 py-2.5">Versão</th>
                    <th className="px-4 py-2.5">Vigência desde</th>
                    <th className="px-4 py-2.5">Publicada em</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-200 dark:divide-navy-700">
                  {route.versions.map((v) => (
                    <tr key={v.id}>
                      <td className="px-4 py-2.5 font-mono text-xs text-ink-900 dark:text-white">
                        v{v.version}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-ink-700 dark:text-white/90">
                        {new Date(v.effectiveFrom).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-ink-700 dark:text-white/90">
                        {v.publishedAt
                          ? new Date(v.publishedAt).toLocaleString('pt-BR', { timeZone: 'UTC' })
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={v.publishedAt ? 'success' : 'warning'}>
                          {v.publishedAt ? 'publicada (imutável)' : 'rascunho'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
