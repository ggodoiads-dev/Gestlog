-- AT-05 oficial: SLA de plantão nunca aprova por silêncio.
-- Adiciona EXPIRED ao enum + sla_minutes/expired_at em approval_requests.

ALTER TYPE "governance"."ApprovalState" ADD VALUE IF NOT EXISTS 'EXPIRED';

ALTER TABLE "governance"."approval_requests"
  ADD COLUMN "sla_minutes" INTEGER NOT NULL DEFAULT 1440,
  ADD COLUMN "expired_at" TIMESTAMP(3);

CREATE INDEX "approval_requests_tenant_id_state_sla_idx"
  ON "governance"."approval_requests"("tenant_id", "state", "created_at");
