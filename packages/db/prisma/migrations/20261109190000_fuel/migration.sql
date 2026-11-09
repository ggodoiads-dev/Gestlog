-- Fuel: tanques, compras, abastecimentos, transferências.
-- AT-13 (compra ≠ consumo), AT-14 (emergencial), AT-15 (transferência ≠ compra).

CREATE SCHEMA IF NOT EXISTS "fuel";

-- Enums --------------------------------------------------------------------
CREATE TYPE "fuel"."FuelProduct" AS ENUM (
  'DIESEL_S10', 'DIESEL_S500', 'ARLA_32',
  'GASOLINE_COMMON', 'GASOLINE_ADDITIVE', 'ETHANOL'
);
CREATE TYPE "fuel"."FuelPurchaseStatus" AS ENUM (
  'PENDING_APPROVAL', 'CONFIRMED', 'REJECTED'
);

-- Tabelas ------------------------------------------------------------------
CREATE TABLE "fuel"."tanks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "garage_id" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "product" "fuel"."FuelProduct" NOT NULL DEFAULT 'DIESEL_S10',
    "capacity_ml" BIGINT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tanks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tanks_tenant_id_code_key" ON "fuel"."tanks"("tenant_id", "code");
CREATE INDEX "tanks_tenant_id_active_idx" ON "fuel"."tanks"("tenant_id", "active");


CREATE TABLE "fuel"."purchases" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tank_id" UUID NOT NULL,
    "supplier_name" TEXT NOT NULL,
    "supplier_cnpj" TEXT,
    "invoice_number" TEXT,
    "quantity_ml" BIGINT NOT NULL,
    "total_cost_cents" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "purchased_at" TIMESTAMP(3) NOT NULL,
    "status" "fuel"."FuelPurchaseStatus" NOT NULL DEFAULT 'CONFIRMED',
    "emergency" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "requested_by" UUID NOT NULL,
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "purchases_tenant_id_tank_id_purchased_at_idx"
  ON "fuel"."purchases"("tenant_id", "tank_id", "purchased_at");
CREATE INDEX "purchases_tenant_id_status_idx"
  ON "fuel"."purchases"("tenant_id", "status");
ALTER TABLE "fuel"."purchases" ADD CONSTRAINT "purchases_tank_id_fkey"
  FOREIGN KEY ("tank_id") REFERENCES "fuel"."tanks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE TABLE "fuel"."fills" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tank_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "driver_id" UUID,
    "quantity_ml" BIGINT NOT NULL,
    "odometer_km" INTEGER,
    "filled_at" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fills_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "fills_tenant_id_tank_id_filled_at_idx"
  ON "fuel"."fills"("tenant_id", "tank_id", "filled_at");
CREATE INDEX "fills_tenant_id_vehicle_id_filled_at_idx"
  ON "fuel"."fills"("tenant_id", "vehicle_id", "filled_at");
ALTER TABLE "fuel"."fills" ADD CONSTRAINT "fills_tank_id_fkey"
  FOREIGN KEY ("tank_id") REFERENCES "fuel"."tanks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE TABLE "fuel"."transfers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "from_tank_id" UUID NOT NULL,
    "to_tank_id" UUID NOT NULL,
    "quantity_ml" BIGINT NOT NULL,
    "transferred_at" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "transfers_tenant_id_from_tank_id_transferred_at_idx"
  ON "fuel"."transfers"("tenant_id", "from_tank_id", "transferred_at");
CREATE INDEX "transfers_tenant_id_to_tank_id_transferred_at_idx"
  ON "fuel"."transfers"("tenant_id", "to_tank_id", "transferred_at");
ALTER TABLE "fuel"."transfers" ADD CONSTRAINT "transfers_from_tank_id_fkey"
  FOREIGN KEY ("from_tank_id") REFERENCES "fuel"."tanks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fuel"."transfers" ADD CONSTRAINT "transfers_to_tank_id_fkey"
  FOREIGN KEY ("to_tank_id") REFERENCES "fuel"."tanks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Schema grants ------------------------------------------------------------
GRANT USAGE ON SCHEMA fuel TO gestlog_app, gestlog_admin;

-- RLS ----------------------------------------------------------------------
ALTER TABLE fuel.tanks ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel.tanks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fuel.tanks
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE fuel.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel.purchases FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fuel.purchases
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE fuel.fills ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel.fills FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fuel.fills
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE fuel.transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel.transfers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fuel.transfers
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

GRANT SELECT, INSERT, UPDATE, DELETE
  ON fuel.tanks, fuel.purchases, fuel.fills, fuel.transfers
  TO gestlog_app;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON fuel.tanks, fuel.purchases, fuel.fills, fuel.transfers
  TO gestlog_admin;

-- Permissões de produto ----------------------------------------------------
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
