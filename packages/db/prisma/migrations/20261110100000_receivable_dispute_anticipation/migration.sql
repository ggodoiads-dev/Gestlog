-- AT-23 (fatura contestada) + AT-25 (recebível antecipado).

ALTER TABLE "ar"."receivables"
  ADD COLUMN "contested_cents" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "dispute_reason" TEXT,
  ADD COLUMN "disputed_at" TIMESTAMP(3),
  ADD COLUMN "disputed_by" UUID,
  ADD COLUMN "anticipated_at" TIMESTAMP(3),
  ADD COLUMN "anticipated_by" UUID,
  ADD COLUMN "anticipation_reference" TEXT;

CREATE INDEX "receivables_tenant_id_anticipated_at_idx"
  ON "ar"."receivables"("tenant_id", "anticipated_at");

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
