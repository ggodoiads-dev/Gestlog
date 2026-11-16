-- Dados estáticos extraídos das migrations originais
-- (permissions do catálogo + grants condicionais em roles).
-- Aplicado após rls.sql no bootstrap.

-- from 20261109003215_rls_policies
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


-- from 20261109105800_ar_permissions
INSERT INTO core.permissions (id, code, module_code, description) VALUES
  (gen_random_uuid(), 'ar.receivables.read',  'ar', 'Visualizar contas a receber'),
  (gen_random_uuid(), 'ar.receivables.issue', 'ar', 'Emitir contas a receber a partir de pre-fatura'),
  (gen_random_uuid(), 'ar.receivables.write', 'ar', 'Atualizar status ou marcar baixa')
ON CONFLICT (code) DO NOTHING;


-- from 20261109115000_governance_rls_permissions
INSERT INTO core.permissions (id, code, module_code, description) VALUES
  (gen_random_uuid(), 'governance.approvals.request', 'governance', 'Abrir um pedido de aprovacao'),
  (gen_random_uuid(), 'governance.approvals.decide',  'governance', 'Aprovar / rejeitar / devolver pedidos'),
  (gen_random_uuid(), 'governance.approvals.read',    'governance', 'Consultar pedidos de aprovacao'),
  (gen_random_uuid(), 'governance.delegations.manage','governance', 'Criar e revogar delegacoes')
ON CONFLICT (code) DO NOTHING;


-- from 20261109120000_procurement_ap_rls_perms
INSERT INTO core.permissions (id, code, module_code, description) VALUES
  (gen_random_uuid(), 'procurement.orders.read',   'procurement', 'Visualizar pedidos de compra'),
  (gen_random_uuid(), 'procurement.orders.manage', 'procurement', 'Criar/atualizar pedidos de compra'),
  (gen_random_uuid(), 'procurement.receive',       'procurement', 'Registrar recebimento de mercadorias/servicos'),
  (gen_random_uuid(), 'ap.payables.read',          'ap',          'Visualizar contas a pagar'),
  (gen_random_uuid(), 'ap.payables.manage',        'ap',          'Lancar contas a pagar'),
  (gen_random_uuid(), 'ap.payments.execute',       'ap',          'Executar pagamentos (SoD distinta de aprovacao)')
ON CONFLICT (code) DO NOTHING;


-- from 20261109130000_finance_rls_perms
INSERT INTO core.permissions (id, code, module_code, description) VALUES
  (gen_random_uuid(), 'finance.periods.read',   'finance', 'Visualizar periodos contabeis e DRE'),
  (gen_random_uuid(), 'finance.periods.close',  'finance', 'Fechar competencia (snapshot imutavel de EBITDA)'),
  (gen_random_uuid(), 'finance.periods.reopen', 'finance', 'Reabrir competencia fechada com justificativa')
ON CONFLICT (code) DO NOTHING;


-- from 20261109180000_treasury_bank
INSERT INTO core.permissions (id, code, module_code, description) VALUES
  (gen_random_uuid(), 'finance.bank.read',       'finance', 'Consultar contas bancárias e extrato'),
  (gen_random_uuid(), 'finance.bank.import',     'finance', 'Importar extrato bancário'),
  (gen_random_uuid(), 'finance.bank.reconcile',  'finance', 'Conciliar movimentos bancários'),
  (gen_random_uuid(), 'finance.bank.manage',     'finance', 'Cadastrar e editar contas bancárias')
ON CONFLICT (code) DO NOTHING;

INSERT INTO core.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM core.roles r CROSS JOIN core.permissions p
WHERE r.code = 'tenant_admin'
  AND p.code IN ('finance.bank.read', 'finance.bank.import',
                 'finance.bank.reconcile', 'finance.bank.manage')
ON CONFLICT DO NOTHING;

INSERT INTO core.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM core.roles r CROSS JOIN core.permissions p
WHERE r.code = 'finance_approver'
  AND p.code IN ('finance.bank.read', 'finance.bank.import', 'finance.bank.reconcile')
ON CONFLICT DO NOTHING;

INSERT INTO core.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM core.roles r CROSS JOIN core.permissions p
WHERE r.code = 'viewer' AND p.code = 'finance.bank.read'
ON CONFLICT DO NOTHING;


-- from 20261109190000_fuel
INSERT INTO core.permissions (id, code, module_code, description) VALUES
  (gen_random_uuid(), 'fuel.tanks.read',   'fuel', 'Consultar tanques'),
  (gen_random_uuid(), 'fuel.tanks.manage', 'fuel', 'Cadastrar e editar tanques'),
  (gen_random_uuid(), 'fuel.purchases.write', 'fuel', 'Registrar compras de combustível'),
  (gen_random_uuid(), 'fuel.purchases.approve', 'fuel', 'Aprovar compra emergencial'),
  (gen_random_uuid(), 'fuel.fills.write', 'fuel', 'Registrar abastecimento de veículo'),
  (gen_random_uuid(), 'fuel.transfers.write', 'fuel', 'Realizar transferências entre tanques')
ON CONFLICT (code) DO NOTHING;

INSERT INTO core.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM core.roles r CROSS JOIN core.permissions p
WHERE r.code = 'tenant_admin'
  AND p.code LIKE 'fuel.%'
ON CONFLICT DO NOTHING;

INSERT INTO core.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM core.roles r CROSS JOIN core.permissions p
WHERE r.code = 'finance_approver'
  AND p.code IN ('fuel.tanks.read', 'fuel.purchases.approve')
ON CONFLICT DO NOTHING;

INSERT INTO core.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM core.roles r CROSS JOIN core.permissions p
WHERE r.code = 'viewer' AND p.code = 'fuel.tanks.read'
ON CONFLICT DO NOTHING;


-- from 20261109200000_assets
INSERT INTO core.permissions (id, code, module_code, description) VALUES
  (gen_random_uuid(), 'assets.read',            'assets', 'Consultar ativos imobilizados'),
  (gen_random_uuid(), 'assets.manage',          'assets', 'Cadastrar e editar ativos'),
  (gen_random_uuid(), 'assets.depreciation.compute', 'assets', 'Calcular depreciação mensal'),
  (gen_random_uuid(), 'assets.life.review',     'assets', 'Registrar revisão de vida útil'),
  (gen_random_uuid(), 'assets.dispose',         'assets', 'Baixar ativo (venda, sucata, perda total)')
ON CONFLICT (code) DO NOTHING;

INSERT INTO core.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM core.roles r CROSS JOIN core.permissions p
WHERE r.code = 'tenant_admin' AND p.code LIKE 'assets.%'
ON CONFLICT DO NOTHING;

INSERT INTO core.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM core.roles r CROSS JOIN core.permissions p
WHERE r.code = 'finance_approver'
  AND p.code IN ('assets.read', 'assets.depreciation.compute', 'assets.dispose')
ON CONFLICT DO NOTHING;

INSERT INTO core.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM core.roles r CROSS JOIN core.permissions p
WHERE r.code = 'viewer' AND p.code = 'assets.read'
ON CONFLICT DO NOTHING;


-- from 20261109220000_contract_adjustments
INSERT INTO core.permissions (id, code, module_code, description) VALUES
  (gen_random_uuid(), 'clm.contracts.adjust', 'clm', 'Reajustar preço de contrato')
ON CONFLICT (code) DO NOTHING;

INSERT INTO core.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM core.roles r CROSS JOIN core.permissions p
WHERE r.code = 'tenant_admin' AND p.code = 'clm.contracts.adjust'
ON CONFLICT DO NOTHING;


-- from 20261110100000_receivable_dispute_anticipation
INSERT INTO core.permissions (id, code, module_code, description) VALUES
  (gen_random_uuid(), 'ar.receivables.dispute',   'ar', 'Registrar e resolver contestação (AT-23)'),
  (gen_random_uuid(), 'ar.receivables.anticipate','ar', 'Antecipar recebível (AT-25)')
ON CONFLICT (code) DO NOTHING;

INSERT INTO core.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM core.roles r CROSS JOIN core.permissions p
WHERE r.code = 'tenant_admin'
  AND p.code IN ('ar.receivables.dispute', 'ar.receivables.anticipate')
ON CONFLICT DO NOTHING;

INSERT INTO core.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM core.roles r CROSS JOIN core.permissions p
WHERE r.code = 'finance_approver'
  AND p.code IN ('ar.receivables.dispute', 'ar.receivables.anticipate')
ON CONFLICT DO NOTHING;

