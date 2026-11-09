-- RLS + grants + permissoes para Governance.

GRANT USAGE ON SCHEMA governance TO gestlog_app, gestlog_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA governance
  TO gestlog_app, gestlog_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA governance
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gestlog_app;

ALTER TABLE governance.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.approval_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON governance.approval_requests;
CREATE POLICY tenant_isolation ON governance.approval_requests
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE governance.approval_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.approval_steps FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON governance.approval_steps;
CREATE POLICY tenant_isolation ON governance.approval_steps
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE governance.delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.delegations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON governance.delegations;
CREATE POLICY tenant_isolation ON governance.delegations
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- Permissoes para o catalogo global.
INSERT INTO core.permissions (id, code, module_code, description) VALUES
  (gen_random_uuid(), 'governance.approvals.request', 'governance', 'Abrir um pedido de aprovacao'),
  (gen_random_uuid(), 'governance.approvals.decide',  'governance', 'Aprovar / rejeitar / devolver pedidos'),
  (gen_random_uuid(), 'governance.approvals.read',    'governance', 'Consultar pedidos de aprovacao'),
  (gen_random_uuid(), 'governance.delegations.manage','governance', 'Criar e revogar delegacoes')
ON CONFLICT (code) DO NOTHING;
