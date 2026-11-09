-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "ap";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "procurement";

-- CreateEnum
CREATE TYPE "procurement"."PurchaseOrderStatus" AS ENUM ('OPEN', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ap"."PayableStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'CONTESTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ap"."PaymentMethod" AS ENUM ('MANUAL', 'BANK_API', 'PIX', 'OFX_IMPORT');

-- CreateEnum
CREATE TYPE "ap"."PaymentExternalStatus" AS ENUM ('CONFIRMED', 'PROCESSING', 'UNKNOWN', 'REJECTED');

-- CreateTable
CREATE TABLE "procurement"."purchase_orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "supplier_name" TEXT NOT NULL,
    "supplier_cnpj" VARCHAR(14),
    "description" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "received_cents" BIGINT NOT NULL DEFAULT 0,
    "invoiced_cents" BIGINT NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "status" "procurement"."PurchaseOrderStatus" NOT NULL DEFAULT 'OPEN',
    "approval_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement"."goods_receipts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "received_by" UUID NOT NULL,
    "reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ap"."payable_invoices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_id" UUID,
    "supplier_name" TEXT NOT NULL,
    "supplier_cnpj" VARCHAR(14),
    "description" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "paid_cents" BIGINT NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" DATE NOT NULL,
    "status" "ap"."PayableStatus" NOT NULL DEFAULT 'OPEN',
    "payment_approval_id" UUID,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payable_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ap"."payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "method" "ap"."PaymentMethod" NOT NULL DEFAULT 'MANUAL',
    "external_status" "ap"."PaymentExternalStatus" NOT NULL DEFAULT 'CONFIRMED',
    "paid_at" TIMESTAMP(3) NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "reference" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ap"."payment_allocations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "payable_id" UUID NOT NULL,
    "amount_cents" BIGINT NOT NULL,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_orders_tenant_id_status_idx" ON "procurement"."purchase_orders"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_tenant_id_code_key" ON "procurement"."purchase_orders"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "goods_receipts_tenant_id_order_id_idx" ON "procurement"."goods_receipts"("tenant_id", "order_id");

-- CreateIndex
CREATE INDEX "payable_invoices_tenant_id_status_due_date_idx" ON "ap"."payable_invoices"("tenant_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "payments_tenant_id_paid_at_idx" ON "ap"."payments"("tenant_id", "paid_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenant_id_idempotency_key_key" ON "ap"."payments"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "payment_allocations_tenant_id_payable_id_idx" ON "ap"."payment_allocations"("tenant_id", "payable_id");

-- CreateIndex
CREATE INDEX "payment_allocations_tenant_id_payment_id_idx" ON "ap"."payment_allocations"("tenant_id", "payment_id");

-- AddForeignKey
ALTER TABLE "procurement"."goods_receipts" ADD CONSTRAINT "goods_receipts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "procurement"."purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ap"."payable_invoices" ADD CONSTRAINT "payable_invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "procurement"."purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ap"."payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "ap"."payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ap"."payment_allocations" ADD CONSTRAINT "payment_allocations_payable_id_fkey" FOREIGN KEY ("payable_id") REFERENCES "ap"."payable_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
