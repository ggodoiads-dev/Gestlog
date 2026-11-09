-- GESTLOG — Row-Level Security (ADR-0003)
--
-- Toda tabela tenant-scoped ganha policy; a role da aplicação (`gestlog_app`)
-- não pode bypassar RLS. A role administrativa (`gestlog_platform_admin`)
-- pode, mas o uso é auditado.
--
-- O NestJS seta `SET LOCAL app.current_tenant = $tenantId` dentro da
-- transação (packages/db/src/rls.ts) antes de qualquer query.

-- Roles ----------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gestlog_app') THEN
    CREATE ROLE gestlog_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gestlog_platform_admin') THEN
    CREATE ROLE gestlog_platform_admin NOLOGIN BYPASSRLS;
  END IF;
END$$;

GRANT USAGE ON SCHEMA core, clients, clm, routing, workforce, fleet, operations, audit
  TO gestlog_app, gestlog_platform_admin;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA
  core, clients, clm, routing, workforce, fleet, operations
  TO gestlog_app;

-- Audit é append-only.
GRANT INSERT, SELECT ON ALL TABLES IN SCHEMA audit TO gestlog_app;
REVOKE UPDATE, DELETE ON ALL TABLES IN SCHEMA audit FROM gestlog_app;

-- Helper function para ler tenant atual com erro explícito ------------------

CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v text;
BEGIN
  v := current_setting('app.current_tenant', true);
  IF v IS NULL OR v = '' THEN
    RAISE EXCEPTION 'tenant_context_missing' USING ERRCODE = '42501';
  END IF;
  RETURN v::uuid;
END;
$$;

-- Policies -------------------------------------------------------------------

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
    'operations.operational_events'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %s
         USING (tenant_id = app_current_tenant())
         WITH CHECK (tenant_id = app_current_tenant())',
      tbl
    );
  END LOOP;
END$$;

-- Audit: tenant_id pode ser NULL para eventos da plataforma.
ALTER TABLE audit.audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON audit.audit_events;
CREATE POLICY tenant_isolation ON audit.audit_events
  USING (
    tenant_id = app_current_tenant()
    OR (tenant_id IS NULL AND current_user = 'gestlog_platform_admin')
  )
  WITH CHECK (
    tenant_id = app_current_tenant()
    OR (tenant_id IS NULL AND current_user = 'gestlog_platform_admin')
  );

-- Append-only via rules
CREATE OR REPLACE RULE audit_no_update AS
  ON UPDATE TO audit.audit_events DO INSTEAD NOTHING;

CREATE OR REPLACE RULE audit_no_delete AS
  ON DELETE TO audit.audit_events DO INSTEAD NOTHING;

-- Permissions catalog (dados globais, seedados na migration) -----------------
-- Alimentamos aqui o catálogo mínimo; roles por tenant são criadas em runtime
-- durante o provisionamento de tenant.

INSERT INTO core.permissions (id, code, module_code, description) VALUES
  (gen_random_uuid(), 'core.users.read',              'core',        'Visualizar usuários do tenant'),
  (gen_random_uuid(), 'core.users.manage',            'core',        'Convidar, suspender e remover usuários'),
  (gen_random_uuid(), 'core.roles.manage',            'core',        'Atribuir e revogar papéis'),
  (gen_random_uuid(), 'core.legal_entities.manage',   'core',        'Gerenciar pessoas jurídicas e garagens'),
  (gen_random_uuid(), 'core.audit.read',              'core',        'Consultar trilha de auditoria'),
  (gen_random_uuid(), 'clients.read',                 'clients',     'Visualizar clientes'),
  (gen_random_uuid(), 'clients.manage',               'clients',     'Cadastrar e atualizar clientes'),
  (gen_random_uuid(), 'clm.contracts.read',           'clm',         'Visualizar contratos'),
  (gen_random_uuid(), 'clm.contracts.manage',         'clm',         'Elaborar e atualizar contratos'),
  (gen_random_uuid(), 'clm.contracts.approve',        'clm',         'Aprovar versões contratuais'),
  (gen_random_uuid(), 'routing.routes.read',          'routing',     'Visualizar rotas'),
  (gen_random_uuid(), 'routing.routes.manage',        'routing',     'Elaborar rotas e versões'),
  (gen_random_uuid(), 'routing.routes.publish',       'routing',     'Publicar versão de rota'),
  (gen_random_uuid(), 'fleet.vehicles.read',          'fleet',       'Visualizar veículos'),
  (gen_random_uuid(), 'fleet.vehicles.manage',        'fleet',       'Cadastrar e atualizar veículos'),
  (gen_random_uuid(), 'workforce.drivers.read',       'workforce',   'Visualizar motoristas'),
  (gen_random_uuid(), 'workforce.drivers.manage',     'workforce',   'Cadastrar e atualizar motoristas'),
  (gen_random_uuid(), 'operations.trips.read',        'operations',  'Visualizar viagens programadas'),
  (gen_random_uuid(), 'operations.trips.dispatch',    'operations',  'Designar motorista e veículo'),
  (gen_random_uuid(), 'operations.trips.validate',    'operations',  'Validar viagem executada'),
  (gen_random_uuid(), 'operations.events.submit',     'operations',  'Submeter eventos operacionais (driver app)')
ON CONFLICT (code) DO NOTHING;
