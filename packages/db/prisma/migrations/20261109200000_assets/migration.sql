-- Assets: ativo imobilizado, depreciação, financiamento, revisão de vida útil, disposal.
-- Cobre AT-29 (EBITDA sem depreciação/juros/IR), AT-30 (consentimento de credor),
-- AT-31 (revisão sem retroatividade), AT-32 (CAPEX ≠ OPEX via classification em payable).

CREATE SCHEMA IF NOT EXISTS "assets";

-- Enums --------------------------------------------------------------------
CREATE TYPE "ap"."PayableClassification" AS ENUM (
  'OPEX_FUEL','OPEX_MAINTENANCE','OPEX_PAYROLL','OPEX_SERVICES','OPEX_INSURANCE',
  'OPEX_OTHER','CAPEX','FINANCIAL_INTEREST','FINANCIAL_PRINCIPAL','TAX_INCOME'
);
CREATE TYPE "assets"."AssetCategory" AS ENUM (
  'VEHICLE','EQUIPMENT','IT_HARDWARE','REAL_ESTATE','FURNITURE','OTHER'
);
CREATE TYPE "assets"."AssetStatus" AS ENUM ('ACTIVE','DISPOSED','WRITE_OFF');
CREATE TYPE "assets"."FinancingStatus" AS ENUM ('ACTIVE','PAID_OFF','DEFAULTED');
CREATE TYPE "assets"."DepreciationState" AS ENUM ('COMPUTED','POSTED');
CREATE TYPE "assets"."DisposalKind" AS ENUM ('SALE','SCRAP','TOTAL_LOSS');

-- Patch em payable_invoices ------------------------------------------------
ALTER TABLE "ap"."payable_invoices"
  ADD COLUMN "classification" "ap"."PayableClassification" NOT NULL DEFAULT 'OPEX_OTHER',
  ADD COLUMN "capitalized_asset_id" UUID;
CREATE INDEX "payable_invoices_tenant_id_classification_issued_at_idx"
  ON "ap"."payable_invoices"("tenant_id", "classification", "issued_at");

-- fixed_assets -------------------------------------------------------------
CREATE TABLE "assets"."fixed_assets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "assets"."AssetCategory" NOT NULL,
    "acquisition_cost_cents" BIGINT NOT NULL,
    "acquisition_date" DATE NOT NULL,
    "residual_cents" BIGINT NOT NULL DEFAULT 0,
    "useful_life_months" INTEGER NOT NULL,
    "opening_accumulated_cents" BIGINT NOT NULL DEFAULT 0,
    "vehicle_id" UUID,
    "status" "assets"."AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "disposed_at" TIMESTAMP(3),
    "disposal_reason" TEXT,
    "disposal_proceeds_cents" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fixed_assets_tenant_id_code_key"
  ON "assets"."fixed_assets"("tenant_id", "code");
CREATE INDEX "fixed_assets_tenant_id_legal_entity_id_status_idx"
  ON "assets"."fixed_assets"("tenant_id", "legal_entity_id", "status");

-- financings ---------------------------------------------------------------
CREATE TABLE "assets"."financings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "creditor_name" TEXT NOT NULL,
    "creditor_cnpj" VARCHAR(14),
    "contract_number" TEXT,
    "original_principal_cents" BIGINT NOT NULL,
    "outstanding_principal_cents" BIGINT NOT NULL,
    "interest_rate_bps" INTEGER NOT NULL,
    "term_months" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "status" "assets"."FinancingStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "financings_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "financings_tenant_id_asset_id_status_idx"
  ON "assets"."financings"("tenant_id", "asset_id", "status");
ALTER TABLE "assets"."financings" ADD CONSTRAINT "financings_asset_id_fkey"
  FOREIGN KEY ("asset_id") REFERENCES "assets"."fixed_assets"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- depreciation_entries -----------------------------------------------------
CREATE TABLE "assets"."depreciation_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "accumulated_cents" BIGINT NOT NULL,
    "useful_life_months_at_calc" INTEGER NOT NULL,
    "state" "assets"."DepreciationState" NOT NULL DEFAULT 'COMPUTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "depreciation_entries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "depreciation_entries_tenant_id_asset_id_year_month_key"
  ON "assets"."depreciation_entries"("tenant_id", "asset_id", "year", "month");
CREATE INDEX "depreciation_entries_tenant_id_year_month_idx"
  ON "assets"."depreciation_entries"("tenant_id", "year", "month");
ALTER TABLE "assets"."depreciation_entries" ADD CONSTRAINT "depreciation_entries_asset_id_fkey"
  FOREIGN KEY ("asset_id") REFERENCES "assets"."fixed_assets"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- life_reviews -------------------------------------------------------------
CREATE TABLE "assets"."life_reviews" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "old_useful_life_months" INTEGER NOT NULL,
    "new_useful_life_months" INTEGER NOT NULL,
    "effective_from" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "decided_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "life_reviews_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "life_reviews_tenant_id_asset_id_effective_from_idx"
  ON "assets"."life_reviews"("tenant_id", "asset_id", "effective_from");
ALTER TABLE "assets"."life_reviews" ADD CONSTRAINT "life_reviews_asset_id_fkey"
  FOREIGN KEY ("asset_id") REFERENCES "assets"."fixed_assets"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- disposals ----------------------------------------------------------------
CREATE TABLE "assets"."disposals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "disposal_kind" "assets"."DisposalKind" NOT NULL,
    "proceeds_cents" BIGINT,
    "disposed_at" TIMESTAMP(3) NOT NULL,
    "creditor_consent_at" TIMESTAMP(3),
    "creditor_consent_doc" TEXT,
    "reason" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "disposals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "disposals_tenant_id_asset_id_idx"
  ON "assets"."disposals"("tenant_id", "asset_id");
ALTER TABLE "assets"."disposals" ADD CONSTRAINT "disposals_asset_id_fkey"
  FOREIGN KEY ("asset_id") REFERENCES "assets"."fixed_assets"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Schema grants ------------------------------------------------------------
GRANT USAGE ON SCHEMA assets TO gestlog_app, gestlog_admin;

-- RLS ----------------------------------------------------------------------
ALTER TABLE assets.fixed_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets.fixed_assets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON assets.fixed_assets
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE assets.financings ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets.financings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON assets.financings
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE assets.depreciation_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets.depreciation_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON assets.depreciation_entries
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE assets.life_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets.life_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON assets.life_reviews
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE assets.disposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets.disposals FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON assets.disposals
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

GRANT SELECT, INSERT, UPDATE, DELETE
  ON assets.fixed_assets, assets.financings, assets.depreciation_entries,
     assets.life_reviews, assets.disposals
  TO gestlog_app;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON assets.fixed_assets, assets.financings, assets.depreciation_entries,
     assets.life_reviews, assets.disposals
  TO gestlog_admin;

-- Permissões de produto ----------------------------------------------------
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
