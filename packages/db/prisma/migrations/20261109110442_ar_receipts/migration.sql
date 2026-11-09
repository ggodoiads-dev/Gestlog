-- CreateEnum
CREATE TYPE "ar"."ReceiptSource" AS ENUM ('MANUAL', 'BANK_OFX', 'BANK_API', 'PIX');

-- AlterTable
ALTER TABLE "ar"."receivables" ADD COLUMN     "paid_cents" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ar"."receipts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "source" "ar"."ReceiptSource" NOT NULL DEFAULT 'MANUAL',
    "received_at" TIMESTAMP(3) NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ar"."receipt_allocations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "receivable_id" UUID NOT NULL,
    "amount_cents" BIGINT NOT NULL,

    CONSTRAINT "receipt_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "receipts_tenant_id_received_at_idx" ON "ar"."receipts"("tenant_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_tenant_id_idempotency_key_key" ON "ar"."receipts"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "receipt_allocations_tenant_id_receivable_id_idx" ON "ar"."receipt_allocations"("tenant_id", "receivable_id");

-- CreateIndex
CREATE INDEX "receipt_allocations_tenant_id_receipt_id_idx" ON "ar"."receipt_allocations"("tenant_id", "receipt_id");

-- AddForeignKey
ALTER TABLE "ar"."receipt_allocations" ADD CONSTRAINT "receipt_allocations_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "ar"."receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar"."receipt_allocations" ADD CONSTRAINT "receipt_allocations_receivable_id_fkey" FOREIGN KEY ("receivable_id") REFERENCES "ar"."receivables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
