-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "ar";

-- CreateEnum
CREATE TYPE "ar"."ReceivableStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'CONTESTED', 'WRITTEN_OFF');

-- CreateTable
CREATE TABLE "ar"."receivables" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "competence_year" INTEGER NOT NULL,
    "competence_month" INTEGER NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "status" "ar"."ReceivableStatus" NOT NULL DEFAULT 'OPEN',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" DATE NOT NULL,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receivables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "receivables_tenant_id_client_id_idx" ON "ar"."receivables"("tenant_id", "client_id");

-- CreateIndex
CREATE INDEX "receivables_tenant_id_status_due_date_idx" ON "ar"."receivables"("tenant_id", "status", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "receivables_tenant_id_contract_id_competence_year_competenc_key" ON "ar"."receivables"("tenant_id", "contract_id", "competence_year", "competence_month");
