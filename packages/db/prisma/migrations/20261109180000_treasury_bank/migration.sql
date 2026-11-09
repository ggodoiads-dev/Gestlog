-- Treasury (fatia 1): BankAccount + BankStatement + BankTransaction
-- Modelo da reconciliação Receipt/Payment ↔ extrato bancário (AT-18, AT-19, AT-25).

-- Enums --------------------------------------------------------------------
CREATE TYPE "finance"."BankTxnKind" AS ENUM ('CREDIT', 'DEBIT');
CREATE TYPE "finance"."BankTxnState" AS ENUM ('PENDING', 'MATCHED', 'IGNORED');

-- Tabelas ------------------------------------------------------------------
CREATE TABLE "finance"."bank_accounts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "bank_code" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bank_accounts_tenant_id_bank_code_branch_account_number_key"
  ON "finance"."bank_accounts"("tenant_id", "bank_code", "branch", "account_number");

CREATE INDEX "bank_accounts_tenant_id_legal_entity_id_idx"
  ON "finance"."bank_accounts"("tenant_id", "legal_entity_id");


CREATE TABLE "finance"."bank_statements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "opening_balance_cents" BIGINT NOT NULL,
    "closing_balance_cents" BIGINT NOT NULL,
    "imported_by" UUID NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bank_statements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bank_statements_tenant_id_bank_account_id_period_start_idx"
  ON "finance"."bank_statements"("tenant_id", "bank_account_id", "period_start");

ALTER TABLE "finance"."bank_statements" ADD CONSTRAINT "bank_statements_bank_account_id_fkey"
  FOREIGN KEY ("bank_account_id") REFERENCES "finance"."bank_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE TABLE "finance"."bank_transactions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "statement_id" UUID,
    "external_id" TEXT NOT NULL,
    "posted_at" TIMESTAMP(3) NOT NULL,
    "kind" "finance"."BankTxnKind" NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "description" TEXT NOT NULL,
    "counterpart_name" TEXT,
    "counterpart_doc" TEXT,
    "state" "finance"."BankTxnState" NOT NULL DEFAULT 'PENDING',
    "matched_receipt_id" UUID,
    "matched_payment_id" UUID,
    "matched_at" TIMESTAMP(3),
    "matched_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- Invariante AT-18: (bank_account, external_id) é único. Importação 2x
-- (OFX + API) devolvendo o mesmo FITID → upsert por essa chave.
CREATE UNIQUE INDEX "bank_transactions_tenant_id_bank_account_id_external_id_key"
  ON "finance"."bank_transactions"("tenant_id", "bank_account_id", "external_id");

CREATE INDEX "bank_transactions_tenant_id_bank_account_id_posted_at_idx"
  ON "finance"."bank_transactions"("tenant_id", "bank_account_id", "posted_at");

CREATE INDEX "bank_transactions_tenant_id_state_idx"
  ON "finance"."bank_transactions"("tenant_id", "state");

ALTER TABLE "finance"."bank_transactions" ADD CONSTRAINT "bank_transactions_bank_account_id_fkey"
  FOREIGN KEY ("bank_account_id") REFERENCES "finance"."bank_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "finance"."bank_transactions" ADD CONSTRAINT "bank_transactions_statement_id_fkey"
  FOREIGN KEY ("statement_id") REFERENCES "finance"."bank_statements"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS + grants -------------------------------------------------------------
ALTER TABLE finance.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.bank_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance.bank_accounts
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE finance.bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.bank_statements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance.bank_statements
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE finance.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.bank_transactions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance.bank_transactions
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

GRANT SELECT, INSERT, UPDATE, DELETE
  ON finance.bank_accounts, finance.bank_statements, finance.bank_transactions
  TO gestlog_app;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON finance.bank_accounts, finance.bank_statements, finance.bank_transactions
  TO gestlog_admin;

-- Permissões de produto ----------------------------------------------------
INSERT INTO core.permissions (id, code, module_code, description) VALUES
  (gen_random_uuid(), 'finance.bank.read',       'finance', 'Consultar contas bancárias e extrato'),
  (gen_random_uuid(), 'finance.bank.import',     'finance', 'Importar extrato bancário'),
  (gen_random_uuid(), 'finance.bank.reconcile',  'finance', 'Conciliar movimentos bancários'),
  (gen_random_uuid(), 'finance.bank.manage',     'finance', 'Cadastrar e editar contas bancárias')
ON CONFLICT (code) DO NOTHING;

-- Liga permissions ↔ roles (role tem code; role_permissions é UUID↔UUID).
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
