-- RLS + grants + permissoes para Finance.

GRANT USAGE ON SCHEMA finance TO gestlog_app, gestlog_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA finance
  TO gestlog_app, gestlog_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA finance
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gestlog_app;

ALTER TABLE finance.accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.accounting_periods FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON finance.accounting_periods;
CREATE POLICY tenant_isolation ON finance.accounting_periods
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE finance.ebitda_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.ebitda_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON finance.ebitda_snapshots;
CREATE POLICY tenant_isolation ON finance.ebitda_snapshots
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- Permissoes
INSERT INTO core.permissions (id, code, module_code, description) VALUES
  (gen_random_uuid(), 'finance.periods.read',   'finance', 'Visualizar periodos contabeis e DRE'),
  (gen_random_uuid(), 'finance.periods.close',  'finance', 'Fechar competencia (snapshot imutavel de EBITDA)'),
  (gen_random_uuid(), 'finance.periods.reopen', 'finance', 'Reabrir competencia fechada com justificativa')
ON CONFLICT (code) DO NOTHING;
