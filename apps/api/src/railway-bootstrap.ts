// Bootstrap do banco antes do `prisma migrate deploy`.
// Executa standalone: `node dist/railway-bootstrap.js`.
// Usa o Prisma client (driver pg interno) para rodar comandos como superuser.
import { PrismaClient } from '@prisma/client';

const APP_PWD = process.env.GESTLOG_APP_PASSWORD;
const ADMIN_PWD = process.env.GESTLOG_ADMIN_PASSWORD;

function fail(msg: string): never {
  // eslint-disable-next-line no-console
  console.error('bootstrap: ' + msg);
  process.exit(1);
}

if (!APP_PWD || !ADMIN_PWD) {
  fail('faltam GESTLOG_APP_PASSWORD / GESTLOG_ADMIN_PASSWORD');
}

if (!process.env.DATABASE_URL) {
  fail('falta DATABASE_URL');
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(
      `DO $$ BEGIN
         CREATE ROLE gestlog_app LOGIN PASSWORD '${APP_PWD}' NOBYPASSRLS;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
    await prisma.$executeRawUnsafe(
      `DO $$ BEGIN
         CREATE ROLE gestlog_admin LOGIN PASSWORD '${ADMIN_PWD}' BYPASSRLS;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );

    const dbRows =
      await prisma.$queryRawUnsafe<{ d: string }[]>('SELECT current_database() AS d');
    const dbname = dbRows[0]?.d ?? 'railway';
    await prisma.$executeRawUnsafe(
      `GRANT CONNECT ON DATABASE "${dbname}" TO gestlog_app, gestlog_admin;`,
    );

    const tblRows = await prisma.$queryRawUnsafe<{ ok: number }[]>(
      "SELECT 1 AS ok FROM information_schema.tables WHERE table_name = '_prisma_migrations'",
    );
    if (tblRows.length > 0) {
      type Row = { migration_name: string };
      const rolled = await prisma.$queryRawUnsafe<Row[]>(
        'DELETE FROM _prisma_migrations WHERE finished_at IS NULL RETURNING migration_name',
      );
      if (rolled.length > 0) {
        // eslint-disable-next-line no-console
        console.log(
          'bootstrap: limpou migrations falhadas: ' +
            rolled.map((r) => r.migration_name).join(', '),
        );
      }
    }
    // eslint-disable-next-line no-console
    console.log('bootstrap: roles ok, estado de migration saneado.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('bootstrap: erro', err);
  process.exit(1);
});
