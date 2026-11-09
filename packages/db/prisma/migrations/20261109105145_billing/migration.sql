-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "billing";

-- CreateEnum
CREATE TYPE "billing"."BillingKind" AS ENUM ('MONTHLY_FIXED', 'PER_TRIP');

-- AlterTable
ALTER TABLE "clm"."contracts" ADD COLUMN     "pricing_amount_cents" BIGINT,
ADD COLUMN     "pricing_currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
ADD COLUMN     "pricing_mode" "billing"."BillingKind";

-- CreateTable
CREATE TABLE "billing"."billing_measurements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "scheduled_trip_id" UUID,
    "kind" "billing"."BillingKind" NOT NULL,
    "competence_year" INTEGER NOT NULL,
    "competence_month" INTEGER NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit_price_cents" BIGINT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "evidence" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "billing_measurements_tenant_id_contract_id_competence_year__idx" ON "billing"."billing_measurements"("tenant_id", "contract_id", "competence_year", "competence_month");

-- CreateIndex
CREATE INDEX "billing_measurements_tenant_id_scheduled_trip_id_idx" ON "billing"."billing_measurements"("tenant_id", "scheduled_trip_id");

-- AddForeignKey
ALTER TABLE "billing"."billing_measurements" ADD CONSTRAINT "billing_measurements_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "clm"."contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
