import { redirect } from 'next/navigation';

import { Badge } from '@gestlog/ui';

import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

interface VehicleRow {
  id: string;
  internalCode: string;
  licensePlate: string;
  category: 'BUS' | 'MINIBUS' | 'VAN' | 'CAR';
  operationalStatus:
    | 'AVAILABLE'
    | 'RESERVED'
    | 'IN_OPERATION'
    | 'IN_MAINTENANCE'
    | 'BLOCKED'
    | 'INACTIVE'
    | 'ALIENATED';
  isEligible: boolean;
  reasons: { code: string; message: string; severity: 'info' | 'warn' | 'block' }[];
}

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  AVAILABLE: 'success',
  RESERVED: 'info',
  IN_OPERATION: 'accent' as never,
  IN_MAINTENANCE: 'warning',
  BLOCKED: 'danger',
  INACTIVE: 'neutral',
  ALIENATED: 'neutral',
};

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: 'disponível',
  RESERVED: 'reservado',
  IN_OPERATION: 'em operação',
  IN_MAINTENANCE: 'em manutenção',
  BLOCKED: 'bloqueado',
  INACTIVE: 'inativo',
  ALIENATED: 'alienado',
};

const CATEGORY_LABEL: Record<string, string> = {
  BUS: 'Ônibus',
  MINIBUS: 'Micro-ônibus',
  VAN: 'Van',
  CAR: 'Carro',
};

function formatPlate(plate: string): string {
  if (plate.length !== 7) return plate;
  return `${plate.slice(0, 3)}-${plate.slice(3)}`;
}

export default async function VeiculosPage(): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect('/login');

  const [{ items }, me] = await Promise.all([
    apiFetch<{ items: VehicleRow[] }>('/v1/vehicles'),
    apiFetch<{ tenant: { name: string } }>('/v1/me'),
  ]);

  const eligible = items.filter((v) => v.isEligible).length;
  const byCategory = items.reduce<Record<string, number>>((acc, v) => {
    acc[v.category] = (acc[v.category] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <AppShell session={session} tenantName={me.tenant.name} activePath="/veiculos">
      <div className="space-y-6">
        <header>
          <span className="text-xs font-medium uppercase tracking-widest text-ink-500">
            Frota
          </span>
          <h1 className="mt-1 text-2xl font-semibold text-ink-900 dark:text-white">
            Veículos
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-700 dark:text-white/70">
            Cadastro técnico único por chassi. Elegibilidade é projeção read-only consolidada
            — AutoDispatch e Operations leem daqui, nunca mantêm status paralelos.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Total
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-ink-900 tabular-nums dark:text-white">
              {items.length}
            </div>
          </article>
          <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Elegíveis
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-success-600 tabular-nums">
              {eligible}
            </div>
            <div className="mt-1 text-xs text-ink-500">disponíveis para despacho</div>
          </article>
          <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Inelegíveis
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-warning-600 tabular-nums">
              {items.length - eligible}
            </div>
            <div className="mt-1 text-xs text-ink-500">bloqueios ou manutenção</div>
          </article>
          <article className="rounded-card border border-surface-200 bg-surface-card p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Por categoria
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {Object.entries(byCategory).map(([cat, n]) => (
                <span
                  key={cat}
                  className="rounded-full border border-surface-200 bg-surface-100 px-2 py-0.5 font-mono text-xs tabular-nums text-ink-700 dark:border-navy-700 dark:bg-navy-800 dark:text-white/80"
                >
                  {CATEGORY_LABEL[cat] ?? cat} · {n}
                </span>
              ))}
            </div>
          </article>
        </section>

        {items.length === 0 ? (
          <div className="rounded-card border border-dashed border-surface-200 p-8 text-center text-sm text-ink-500 dark:border-navy-700">
            Nenhum veículo cadastrado.
          </div>
        ) : (
          <div className="overflow-hidden rounded-card border border-surface-200 bg-surface-card shadow-sm dark:border-navy-700 dark:bg-navy-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 text-left text-[11px] uppercase tracking-wider text-ink-500 dark:border-navy-700">
                  <th className="px-4 py-2.5">Código</th>
                  <th className="px-4 py-2.5">Placa</th>
                  <th className="px-4 py-2.5">Categoria</th>
                  <th className="px-4 py-2.5">Status operacional</th>
                  <th className="px-4 py-2.5">Elegibilidade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-200 dark:divide-navy-700">
                {items.map((v) => {
                  const tone = STATUS_TONE[v.operationalStatus] ?? 'neutral';
                  const reasons = v.reasons ?? [];
                  return (
                    <tr key={v.id} className="hover:bg-surface-100/50 dark:hover:bg-navy-800/50">
                      <td className="px-4 py-2.5 font-mono text-xs text-ink-900 dark:text-white">
                        {v.internalCode}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-ink-700 dark:text-white/90">
                        {formatPlate(v.licensePlate)}
                      </td>
                      <td className="px-4 py-2.5 text-ink-700 dark:text-white/90">
                        {CATEGORY_LABEL[v.category] ?? v.category}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={tone === 'accent' as never ? 'accent' : (tone as never)}>
                          {STATUS_LABEL[v.operationalStatus] ?? v.operationalStatus.toLowerCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        {v.isEligible ? (
                          <Badge tone="success">elegível</Badge>
                        ) : (
                          <div className="space-y-0.5">
                            <Badge tone="danger">inelegível</Badge>
                            {reasons.length > 0 ? (
                              <div className="text-[10px] text-ink-500">
                                {reasons[0]?.message}
                              </div>
                            ) : null}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
