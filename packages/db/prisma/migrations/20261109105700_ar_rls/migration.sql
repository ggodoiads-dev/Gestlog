-- RLS + grants para AR.

GRANT USAGE ON SCHEMA ar TO gestlog_app, gestlog_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ar
  TO gestlog_app, gestlog_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA ar
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gestlog_app;

ALTER TABLE ar.receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar.receivables FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ar.receivables;
CREATE POLICY tenant_isolation ON ar.receivables
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
