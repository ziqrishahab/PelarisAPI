/*
  Warnings:

  - The values [DAMAGED] on the enum `ReturnReason` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[tenantId,name]` on the table `cabang` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,email]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `tenantId` to the `cabang` table without a default value. This is not possible if the table is not empty.
  - Made the column `shippingCost` on table `transactions` required. This step will fail if there are existing NULL values in that column.
  - Made the column `platformFee` on table `transactions` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `tenantId` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ReturnType" AS ENUM ('REFUND', 'EXCHANGE');

-- CreateEnum
CREATE TYPE "CashType" AS ENUM ('SALE', 'RETURN', 'EXPENSE', 'DEPOSIT', 'WITHDRAW', 'OTHER');

-- AlterEnum
BEGIN;
CREATE TYPE "ReturnReason_new" AS ENUM ('CUSTOMER_REQUEST', 'OTHER', 'WRONG_SIZE', 'WRONG_ITEM', 'DEFECTIVE', 'EXPIRED');
ALTER TABLE "returns" ALTER COLUMN "reason" TYPE "ReturnReason_new" USING ("reason"::text::"ReturnReason_new");
ALTER TYPE "ReturnReason" RENAME TO "ReturnReason_old";
ALTER TYPE "ReturnReason_new" RENAME TO "ReturnReason";
DROP TYPE "public"."ReturnReason_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_kasirId_fkey";

-- DropIndex
DROP INDEX "cabang_name_key";

-- DropIndex
DROP INDEX "users_email_key";

-- AlterTable
ALTER TABLE "cabang" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "printer_settings" ALTER COLUMN "storeName" SET DEFAULT 'Harapan Abah';

-- AlterTable
ALTER TABLE "returns" ADD COLUMN     "conditionNote" TEXT,
ADD COLUMN     "isOverdue" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "managerOverride" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "priceDifference" DOUBLE PRECISION,
ADD COLUMN     "reasonDetail" TEXT,
ADD COLUMN     "returnType" "ReturnType" NOT NULL DEFAULT 'REFUND';

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "deviceSource" TEXT,
ALTER COLUMN "paymentMethod" DROP NOT NULL,
ALTER COLUMN "shippingCost" SET NOT NULL,
ALTER COLUMN "platformFee" SET NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "logo" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxUsers" INTEGER NOT NULL DEFAULT 999999,
    "maxProducts" INTEGER NOT NULL DEFAULT 999999,
    "maxCabang" INTEGER NOT NULL DEFAULT 999999,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_transactions" (
    "id" TEXT NOT NULL,
    "type" "CashType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "cabangId" TEXT NOT NULL,
    "returnId" TEXT,
    "transactionId" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "returnEnabled" BOOLEAN NOT NULL DEFAULT false,
    "returnDeadlineDays" INTEGER NOT NULL DEFAULT 7,
    "returnRequiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "exchangeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_items" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "variantInfo" TEXT NOT NULL,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_subdomain_key" ON "tenants"("subdomain");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_email_key" ON "tenants"("email");

-- CreateIndex
CREATE UNIQUE INDEX "cash_transactions_returnId_key" ON "cash_transactions"("returnId");

-- CreateIndex
CREATE UNIQUE INDEX "cabang_tenantId_name_key" ON "cabang"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenantId", "email");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cabang" ADD CONSTRAINT "cabang_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_kasirId_fkey" FOREIGN KEY ("kasirId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_cabangId_fkey" FOREIGN KEY ("cabangId") REFERENCES "cabang"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "returns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_items" ADD CONSTRAINT "exchange_items_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_items" ADD CONSTRAINT "exchange_items_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
