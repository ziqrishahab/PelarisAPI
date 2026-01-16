/*
  Warnings:

  - The values [WRONG_SIZE,DEFECTIVE] on the enum `ReturnReason` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `sku` on the `exchange_items` table. All the data in the column will be lost.
  - The `returnType` column on the `returns` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `address` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `email` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `logo` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `maxCabang` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `maxProducts` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `maxUsers` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `storeName` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `subdomain` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the `app_settings` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[name]` on the table `categories` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[slug]` on the table `tenants` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[email]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `name` to the `tenants` table without a default value. This is not possible if the table is not empty.
  - Added the required column `slug` to the `tenants` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ReturnReason_new" AS ENUM ('DAMAGED', 'WRONG_ITEM', 'EXPIRED', 'CUSTOMER_REQUEST', 'OTHER');
ALTER TABLE "returns" ALTER COLUMN "reason" TYPE "ReturnReason_new" USING ("reason"::text::"ReturnReason_new");
ALTER TYPE "ReturnReason" RENAME TO "ReturnReason_old";
ALTER TYPE "ReturnReason_new" RENAME TO "ReturnReason";
DROP TYPE "public"."ReturnReason_old";
COMMIT;

-- DropIndex
DROP INDEX "cash_transactions_returnId_key";

-- DropIndex
DROP INDEX "categories_tenantId_idx";

-- DropIndex
DROP INDEX "tenants_email_key";

-- DropIndex
DROP INDEX "tenants_subdomain_key";

-- AlterTable
ALTER TABLE "exchange_items" DROP COLUMN "sku";

-- AlterTable
ALTER TABLE "printer_settings" ALTER COLUMN "storeName" SET DEFAULT 'Pelaris.id';

-- AlterTable
ALTER TABLE "returns" DROP COLUMN "returnType",
ADD COLUMN     "returnType" TEXT;

-- AlterTable
ALTER TABLE "tenants" DROP COLUMN "address",
DROP COLUMN "email",
DROP COLUMN "logo",
DROP COLUMN "maxCabang",
DROP COLUMN "maxProducts",
DROP COLUMN "maxUsers",
DROP COLUMN "phone",
DROP COLUMN "storeName",
DROP COLUMN "subdomain",
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "slug" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "hasMultiCabangAccess" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "app_settings";

-- DropEnum
DROP TYPE "ReturnType";

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "cabangId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_createdAt_idx" ON "audit_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_cabangId_createdAt_idx" ON "audit_logs"("cabangId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "cash_transactions_cabangId_createdAt_idx" ON "cash_transactions"("cabangId", "createdAt");

-- CreateIndex
CREATE INDEX "cash_transactions_returnId_idx" ON "cash_transactions"("returnId");

-- CreateIndex
CREATE INDEX "cash_transactions_transactionId_idx" ON "cash_transactions"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE INDEX "channel_stocks_channelId_idx" ON "channel_stocks"("channelId");

-- CreateIndex
CREATE INDEX "channel_stocks_productVariantId_idx" ON "channel_stocks"("productVariantId");

-- CreateIndex
CREATE INDEX "orders_cabangId_idx" ON "orders"("cabangId");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_cabangId_status_idx" ON "orders"("cabangId", "status");

-- CreateIndex
CREATE INDEX "orders_requestedById_idx" ON "orders"("requestedById");

-- CreateIndex
CREATE INDEX "product_variants_productId_idx" ON "product_variants"("productId");

-- CreateIndex
CREATE INDEX "product_variants_sku_idx" ON "product_variants"("sku");

-- CreateIndex
CREATE INDEX "returns_cabangId_idx" ON "returns"("cabangId");

-- CreateIndex
CREATE INDEX "returns_cabangId_createdAt_idx" ON "returns"("cabangId", "createdAt");

-- CreateIndex
CREATE INDEX "returns_transactionId_idx" ON "returns"("transactionId");

-- CreateIndex
CREATE INDEX "returns_status_idx" ON "returns"("status");

-- CreateIndex
CREATE INDEX "stock_adjustments_cabangId_idx" ON "stock_adjustments"("cabangId");

-- CreateIndex
CREATE INDEX "stock_adjustments_cabangId_createdAt_idx" ON "stock_adjustments"("cabangId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_adjustments_stockId_idx" ON "stock_adjustments"("stockId");

-- CreateIndex
CREATE INDEX "stock_transfers_fromCabangId_idx" ON "stock_transfers"("fromCabangId");

-- CreateIndex
CREATE INDEX "stock_transfers_toCabangId_idx" ON "stock_transfers"("toCabangId");

-- CreateIndex
CREATE INDEX "stock_transfers_variantId_idx" ON "stock_transfers"("variantId");

-- CreateIndex
CREATE INDEX "stock_transfers_status_idx" ON "stock_transfers"("status");

-- CreateIndex
CREATE INDEX "stock_transfers_createdAt_idx" ON "stock_transfers"("createdAt");

-- CreateIndex
CREATE INDEX "stocks_cabangId_idx" ON "stocks"("cabangId");

-- CreateIndex
CREATE INDEX "stocks_productVariantId_idx" ON "stocks"("productVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE INDEX "users_cabangId_idx" ON "users"("cabangId");

-- CreateIndex
CREATE INDEX "users_tenantId_isActive_idx" ON "users"("tenantId", "isActive");
