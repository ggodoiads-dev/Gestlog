// Bootstrap do banco antes do `prisma migrate deploy`.
// 1. Cria as roles RLS (idempotente).
// 2. Limpa a entrada de qualquer migration marcada como falhada (somente a baseline
//    que depende das roles — rodadas antes delas existirem).
// Executa como o usuário superuser (DATABASE_URL — postgres), não como gestlog_app.

const { Client } = require("pg");

const APP_PWD = process.env.GESTLOG_APP_PASSWORD;
const ADMIN_PWD = process.env.GESTLOG_ADMIN_PASSWORD;

if (!APP_PWD || !ADMIN_PWD) {
  console.error("bootstrap: faltam GESTLOG_APP_PASSWORD / GESTLOG_ADMIN_PASSWORD");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("bootstrap: falta DATABASE_URL");
  process.exit(1);
}

(async () => {
  const c = new Client({ connectionString: url });
  await c.connect();

  // Postgres do Railway usa SSL com cert auto-assinado; Prisma lida com isso
  // via query params. Aqui o pg driver aceita sem mais fuss.

  await c.query(
    `DO $$ BEGIN
       CREATE ROLE gestlog_app LOGIN PASSWORD '${APP_PWD}' NOBYPASSRLS;
     EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  );
  await c.query(
    `DO $$ BEGIN
       CREATE ROLE gestlog_admin LOGIN PASSWORD '${ADMIN_PWD}' BYPASSRLS;
     EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  );

  const db = await c.query("SELECT current_database() AS d");
  const dbname = db.rows[0].d;
  await c.query(`GRANT CONNECT ON DATABASE "${dbname}" TO gestlog_app, gestlog_admin;`);

  // Se a tabela _prisma_migrations já existe, apaga entradas marcadas como
  // falhadas (finished_at IS NULL) para que o próximo migrate deploy as reaplique.
  const tbl = await c.query(
    "SELECT 1 FROM information_schema.tables WHERE table_name = '_prisma_migrations'",
  );
  if (tbl.rowCount > 0) {
    const r = await c.query(
      "DELETE FROM _prisma_migrations WHERE finished_at IS NULL RETURNING migration_name",
    );
    if (r.rowCount > 0) {
      console.log(
        "bootstrap: limpou migrations falhadas:",
        r.rows.map((x) => x.migration_name).join(", "),
      );
    }
  }

  await c.end();
  console.log("bootstrap: roles ok, estado de migration saneado.");
})().catch((err) => {
  console.error("bootstrap: erro", err);
  process.exit(1);
});
