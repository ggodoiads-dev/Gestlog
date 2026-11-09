-- Roles de aplicação criadas no bootstrap inicial do Postgres (dev).
-- Em produção, essas roles são criadas via infraestrutura, com senhas
-- geridas por secret manager.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gestlog_app') THEN
    CREATE ROLE gestlog_app LOGIN PASSWORD 'gestlog_app';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gestlog_admin') THEN
    CREATE ROLE gestlog_admin LOGIN PASSWORD 'gestlog_admin' BYPASSRLS;
  END IF;
END$$;

GRANT ALL PRIVILEGES ON DATABASE gestlog TO gestlog_app;
GRANT ALL PRIVILEGES ON DATABASE gestlog TO gestlog_admin;
