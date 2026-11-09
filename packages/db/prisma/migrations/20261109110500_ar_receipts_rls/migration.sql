-- RLS + grants para receipts / allocations.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ar
  TO gestlog_app, gestlog_admin;

ALTER TABLE ar.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar.receipts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ar.receipts;
CREATE POLICY tenant_isolation ON ar.receipts
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE ar.receipt_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar.receipt_allocations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ar.receipt_allocations;
CREATE POLICY tenant_isolation ON ar.receipt_allocations
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
