-- RLS + grants + permissoes para Procurement/AP.

GRANT USAGE ON SCHEMA procurement, ap TO gestlog_app, gestlog_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA procurement
  TO gestlog_app, gestlog_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ap
  TO gestlog_app, gestlog_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA procurement
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gestlog_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA ap
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gestlog_app;

-- RLS procurement
ALTER TABLE procurement.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.purchase_orders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON procurement.purchase_orders;
CREATE POLICY tenant_isolation ON procurement.purchase_orders
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE procurement.goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.goods_receipts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON procurement.goods_receipts;
CREATE POLICY tenant_isolation ON procurement.goods_receipts
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- RLS ap
ALTER TABLE ap.payable_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE ap.payable_invoices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ap.payable_invoices;
CREATE POLICY tenant_isolation ON ap.payable_invoices
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE ap.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ap.payments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ap.payments;
CREATE POLICY tenant_isolation ON ap.payments
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE ap.payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ap.payment_allocations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ap.payment_allocations;
CREATE POLICY tenant_isolation ON ap.payment_allocations
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- Permissoes catalogo global
INSERT INTO core.permissions (id, code, module_code, description) VALUES
  (gen_random_uuid(), 'procurement.orders.read',   'procurement', 'Visualizar pedidos de compra'),
  (gen_random_uuid(), 'procurement.orders.manage', 'procurement', 'Criar/atualizar pedidos de compra'),
  (gen_random_uuid(), 'procurement.receive',       'procurement', 'Registrar recebimento de mercadorias/servicos'),
  (gen_random_uuid(), 'ap.payables.read',          'ap',          'Visualizar contas a pagar'),
  (gen_random_uuid(), 'ap.payables.manage',        'ap',          'Lancar contas a pagar'),
  (gen_random_uuid(), 'ap.payments.execute',       'ap',          'Executar pagamentos (SoD distinta de aprovacao)')
ON CONFLICT (code) DO NOTHING;
