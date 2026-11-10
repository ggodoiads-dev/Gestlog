-- AT-21: reajuste de preço no meio do período preserva o preço anterior.
-- Cada reajuste é imutável; o billing consulta o adjustment vigente na
-- competência. Medições já geradas usaram o preço vigente à época.

CREATE TABLE "clm"."contract_adjustments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "old_pricing_mode" "billing"."BillingKind",
    "old_pricing_amount_cents" BIGINT,
    "new_pricing_mode" "billing"."BillingKind" NOT NULL,
    "new_pricing_amount_cents" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "reason" TEXT NOT NULL,
    "decided_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contract_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contract_adjustments_tenant_id_contract_id_effective_from_key"
  ON "clm"."contract_adjustments"("tenant_id", "contract_id", "effective_from");

CREATE INDEX "contract_adjustments_tenant_id_contract_id_effective_from_idx"
  ON "clm"."contract_adjustments"("tenant_id", "contract_id", "effective_from");

ALTER TABLE "clm"."contract_adjustments" ADD CONSTRAINT "contract_adjustments_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "clm"."contracts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS + grants -------------------------------------------------------------
ALTER TABLE clm.contract_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE clm.contract_adjustments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON clm.contract_adjustments
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

GRANT SELECT, INSERT, UPDATE, DELETE ON clm.contract_adjustments TO gestlog_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON clm.contract_adjustments TO gestlog_admin;

INSERT INTO core.permissions (id, code, module_code, description) VALUES
  (gen_random_uuid(), 'clm.contracts.adjust', 'clm', 'Reajustar preço de contrato')
ON CONFLICT (code) DO NOTHING;

INSERT INTO core.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM core.roles r CROSS JOIN core.permissions p
WHERE r.code = 'tenant_admin' AND p.code = 'clm.contracts.adjust'
ON CONFLICT DO NOTHING;
