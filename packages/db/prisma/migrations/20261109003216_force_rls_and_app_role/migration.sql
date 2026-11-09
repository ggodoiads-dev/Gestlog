-- FORCE ROW LEVEL SECURITY em todas as tabelas tenant-scoped.
-- Sem isso, o owner da tabela (role que roda migrations) bypassa RLS.
-- A role da aplicação (gestlog_app) precisa de GRANTs explícitos sem BYPASSRLS.

-- Role da aplicação (sem BYPASSRLS) ------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gestlog_app') THEN
    CREATE ROLE gestlog_app LOGIN PASSWORD 'gestlog_app';
  ELSE
    ALTER ROLE gestlog_app WITH LOGIN PASSWORD 'gestlog_app';
  END IF;
  -- Garante que não tem BYPASSRLS, mesmo que já existisse.
  ALTER ROLE gestlog_app NOBYPASSRLS;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gestlog_admin') THEN
    CREATE ROLE gestlog_admin LOGIN PASSWORD 'gestlog_admin' BYPASSRLS;
  ELSE
    ALTER ROLE gestlog_admin WITH LOGIN PASSWORD 'gestlog_admin' BYPASSRLS;
  END IF;
END$$;

-- Grants para schemas e tabelas existentes -----------------------------------
GRANT CONNECT ON DATABASE gestlog TO gestlog_app, gestlog_admin;
GRANT USAGE ON SCHEMA core, clients, clm, routing, workforce, fleet, operations, audit, public
  TO gestlog_app, gestlog_admin;

-- CRUD para gestlog_app em tudo exceto audit (que é append-only).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA
  core, clients, clm, routing, workforce, fleet, operations
  TO gestlog_app;

-- Audit é append-only para gestlog_app
GRANT INSERT, SELECT ON ALL TABLES IN SCHEMA audit TO gestlog_app;

-- gestlog_admin tem tudo (uso explicito para login e manutencao)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA
  core, clients, clm, routing, workforce, fleet, operations, audit
  TO gestlog_admin;

-- Default privileges para tabelas futuras criadas por migrations
ALTER DEFAULT PRIVILEGES IN SCHEMA
  core, clients, clm, routing, workforce, fleet, operations
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gestlog_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA audit
  GRANT SELECT, INSERT ON TABLES TO gestlog_app;

-- FORCE RLS - necessario porque o owner das tabelas bypassa RLS por padrao ---
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'core.legal_entities',
    'core.garages',
    'core.users',
    'core.user_roles',
    'core.documents',
    'core.idempotency_records',
    'clients.clients',
    'clients.client_units',
    'clm.contracts',
    'clm.contract_versions',
    'routing.routes',
    'routing.route_versions',
    'routing.route_stops',
    'routing.route_turns',
    'workforce.drivers',
    'workforce.driver_licenses',
    'fleet.vehicles',
    'fleet.vehicle_eligibility_projection',
    'fleet.custodies',
    'operations.scheduled_trips',
    'operations.assignments',
    'operations.trip_executions',
    'operations.operational_events',
    'audit.audit_events'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tbl);
  END LOOP;
END$$;

-- audit_events sequence precisa de acesso tambem
GRANT USAGE ON ALL SEQUENCES IN SCHEMA
  core, clients, clm, routing, workforce, fleet, operations, audit
  TO gestlog_app, gestlog_admin;

ALTER DEFAULT PRIVILEGES IN SCHEMA
  core, clients, clm, routing, workforce, fleet, operations, audit
  GRANT USAGE ON SEQUENCES TO gestlog_app, gestlog_admin;
