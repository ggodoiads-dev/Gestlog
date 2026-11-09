-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "finance";

-- CreateEnum
CREATE TYPE "finance"."AccountingPeriodState" AS ENUM ('OPEN', 'CLOSING', 'CLOSED', 'REOPENED');

-- CreateTable
CREATE TABLE "finance"."accounting_periods" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "state" "finance"."AccountingPeriodState" NOT NULL DEFAULT 'OPEN',
    "closed_at" TIMESTAMP(3),
    "closed_by" UUID,
    "reopened_at" TIMESTAMP(3),
    "reopened_by" UUID,
    "reopen_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."ebitda_snapshots" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "revenue_cents" BIGINT NOT NULL,
    "opex_cents" BIGINT NOT NULL,
    "ebitda_cents" BIGINT NOT NULL,
    "margin_bps" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "computed_by" UUID,

    CONSTRAINT "ebitda_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accounting_periods_tenant_id_state_idx" ON "finance"."accounting_periods"("tenant_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_periods_tenant_id_legal_entity_id_year_month_key" ON "finance"."accounting_periods"("tenant_id", "legal_entity_id", "year", "month");

-- CreateIndex
CREATE INDEX "ebitda_snapshots_tenant_id_legal_entity_id_year_month_idx" ON "finance"."ebitda_snapshots"("tenant_id", "legal_entity_id", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "ebitda_snapshots_period_id_version_key" ON "finance"."ebitda_snapshots"("period_id", "version");

-- AddForeignKey
ALTER TABLE "finance"."ebitda_snapshots" ADD CONSTRAINT "ebitda_snapshots_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "finance"."accounting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
