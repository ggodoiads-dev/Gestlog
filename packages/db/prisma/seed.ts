/**
 * Seeds de DEMONSTRAÇÃO. Nenhum dado real da Primeira Classe Transportes
 * entra por aqui. Todo registro criado carrega `__demo__: true` no JSON
 * e a UI exibe banner de modo demo.
 *
 * O seed real é feito apenas quando FEATURE_DEMO_SEEDS=true.
 */
import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  const flag = process.env.FEATURE_DEMO_SEEDS;
  if (flag !== 'true') {
    console.warn('FEATURE_DEMO_SEEDS != "true" — pulando seeds de demo.');
    return;
  }
  const prisma = new PrismaClient();
  try {
    console.warn('[seed] placeholder — implementação detalhada virá com os módulos.');
    // Próximos commits: tenants demo (demo_pct, demo_city_bus), perfis,
    // rotas sintéticas, veículos marcados como demo.
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
