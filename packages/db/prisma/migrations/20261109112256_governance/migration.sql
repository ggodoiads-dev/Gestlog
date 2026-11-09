-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "governance";

-- CreateEnum
CREATE TYPE "governance"."ApprovalState" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "governance"."ApprovalDecision" AS ENUM ('APPROVE', 'REJECT', 'RETURN');

-- CreateTable
CREATE TABLE "governance"."approval_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "subject_version" INTEGER NOT NULL DEFAULT 1,
    "requested_by" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "amount_cents" BIGINT,
    "currency" VARCHAR(3),
    "snapshot_json" JSONB NOT NULL,
    "state" "governance"."ApprovalState" NOT NULL DEFAULT 'PENDING',
    "required_approvals" INTEGER NOT NULL DEFAULT 1,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "governance"."approval_steps" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "approver_id" UUID NOT NULL,
    "decision" "governance"."ApprovalDecision" NOT NULL,
    "comment" TEXT,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "governance"."delegations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "delegator_id" UUID NOT NULL,
    "delegate_id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "max_amount_cents" BIGINT,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delegations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "approval_requests_tenant_id_state_idx" ON "governance"."approval_requests"("tenant_id", "state");

-- CreateIndex
CREATE INDEX "approval_requests_tenant_id_subject_type_subject_id_idx" ON "governance"."approval_requests"("tenant_id", "subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "approval_steps_tenant_id_request_id_idx" ON "governance"."approval_steps"("tenant_id", "request_id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_steps_request_id_approver_id_key" ON "governance"."approval_steps"("request_id", "approver_id");

-- CreateIndex
CREATE INDEX "delegations_tenant_id_delegate_id_valid_from_valid_until_idx" ON "governance"."delegations"("tenant_id", "delegate_id", "valid_from", "valid_until");

-- AddForeignKey
ALTER TABLE "governance"."approval_steps" ADD CONSTRAINT "approval_steps_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "governance"."approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
