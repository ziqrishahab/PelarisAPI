/*
  Warnings:

  - You are about to alter the column `action` on the `audit_logs` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `entityType` on the `audit_logs` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to alter the column `entityId` on the `audit_logs` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to alter the column `description` on the `audit_logs` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.
  - You are about to alter the column `ip` on the `audit_logs` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to alter the column `name` on the `cabang` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `address` on the `cabang` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.
  - You are about to alter the column `phone` on the `cabang` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(20)`.
  - You are about to alter the column `description` on the `cash_transactions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.
  - You are about to alter the column `name` on the `categories` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `description` on the `categories` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.
  - You are about to alter the column `productName` on the `exchange_items` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `variantInfo` on the `exchange_items` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `orderNo` on the `orders` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to alter the column `productName` on the `orders` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `categoryName` on the `orders` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `notes` on the `orders` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.
  - You are about to alter the column `rejectionReason` on the `orders` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.
  - You are about to alter the column `reason` on the `price_discrepancies` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.
  - You are about to alter the column `resolvedBy` on the `price_discrepancies` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to alter the column `printerName` on the `printer_settings` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `storeName` on the `printer_settings` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `branchName` on the `printer_settings` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `address` on the `printer_settings` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.
  - You are about to alter the column `phone` on the `printer_settings` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(20)`.
  - You are about to alter the column `footerText1` on the `printer_settings` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `footerText2` on the `printer_settings` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `variantName` on the `product_variants` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(150)`.
  - You are about to alter the column `variantValue` on the `product_variants` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `sku` on the `product_variants` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `imageUrl` on the `product_variants` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.
  - You are about to alter the column `name` on the `products` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `description` on the `products` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(1000)`.
  - You are about to alter the column `productName` on the `return_items` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `variantInfo` on the `return_items` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `sku` on the `return_items` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `returnNo` on the `returns` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to alter the column `notes` on the `returns` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.
  - You are about to alter the column `approvedBy` on the `returns` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to alter the column `conditionNote` on the `returns` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.
  - You are about to alter the column `reasonDetail` on the `returns` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.
  - You are about to alter the column `returnType` on the `returns` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(20)`.
  - You are about to alter the column `code` on the `sales_channels` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to alter the column `name` on the `sales_channels` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `icon` on the `sales_channels` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `color` on the `sales_channels` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(20)`.
  - You are about to alter the column `key` on the `settings` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `value` on the `settings` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(1000)`.
  - You are about to alter the column `notes` on the `stock_adjustments` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.
  - You are about to alter the column `transferNo` on the `stock_transfers` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to alter the column `notes` on the `stock_transfers` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.
  - You are about to alter the column `name` on the `tenants` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `slug` on the `tenants` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `productName` on the `transaction_items` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `variantInfo` on the `transaction_items` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `sku` on the `transaction_items` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `customerName` on the `transactions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `customerPhone` on the `transactions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(20)`.
  - You are about to alter the column `notes` on the `transactions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(1000)`.
  - You are about to alter the column `bankName` on the `transactions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `cardLastDigits` on the `transactions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(4)`.
  - You are about to alter the column `referenceNo` on the `transactions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `bankName2` on the `transactions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `referenceNo2` on the `transactions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `externalOrderId` on the `transactions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `externalInvoice` on the `transactions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `externalStatus` on the `transactions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to alter the column `buyerUsername` on the `transactions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `deviceSource` on the `transactions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to alter the column `email` on the `users` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `password` on the `users` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `name` on the `users` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `value` on the `variant_options` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `name` on the `variant_types` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.

*/
-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "action" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "entityType" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "entityId" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "description" SET DATA TYPE VARCHAR(500),
ALTER COLUMN "ip" SET DATA TYPE VARCHAR(50);

-- AlterTable
ALTER TABLE "cabang" ALTER COLUMN "name" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "address" SET DATA TYPE VARCHAR(500),
ALTER COLUMN "phone" SET DATA TYPE VARCHAR(20);

-- AlterTable
ALTER TABLE "cash_transactions" ALTER COLUMN "description" SET DATA TYPE VARCHAR(500);

-- AlterTable
ALTER TABLE "categories" ALTER COLUMN "name" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "description" SET DATA TYPE VARCHAR(500);

-- AlterTable
ALTER TABLE "exchange_items" ALTER COLUMN "productName" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "variantInfo" SET DATA TYPE VARCHAR(255);

-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "orderNo" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "productName" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "categoryName" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "notes" SET DATA TYPE VARCHAR(500),
ALTER COLUMN "rejectionReason" SET DATA TYPE VARCHAR(500);

-- AlterTable
ALTER TABLE "price_discrepancies" ALTER COLUMN "reason" SET DATA TYPE VARCHAR(500),
ALTER COLUMN "resolvedBy" SET DATA TYPE VARCHAR(50);

-- AlterTable
ALTER TABLE "printer_settings" ALTER COLUMN "printerName" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "storeName" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "branchName" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "address" SET DATA TYPE VARCHAR(500),
ALTER COLUMN "phone" SET DATA TYPE VARCHAR(20),
ALTER COLUMN "footerText1" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "footerText2" SET DATA TYPE VARCHAR(255);

-- AlterTable
ALTER TABLE "product_variants" ALTER COLUMN "variantName" SET DATA TYPE VARCHAR(150),
ALTER COLUMN "variantValue" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "sku" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "imageUrl" SET DATA TYPE VARCHAR(500);

-- AlterTable
ALTER TABLE "products" ALTER COLUMN "name" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "description" SET DATA TYPE VARCHAR(1000);

-- AlterTable
ALTER TABLE "return_items" ALTER COLUMN "productName" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "variantInfo" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "sku" SET DATA TYPE VARCHAR(100);

-- AlterTable
ALTER TABLE "returns" ALTER COLUMN "returnNo" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "notes" SET DATA TYPE VARCHAR(500),
ALTER COLUMN "approvedBy" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "conditionNote" SET DATA TYPE VARCHAR(500),
ALTER COLUMN "reasonDetail" SET DATA TYPE VARCHAR(500),
ALTER COLUMN "returnType" SET DATA TYPE VARCHAR(20);

-- AlterTable
ALTER TABLE "sales_channels" ALTER COLUMN "code" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "name" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "icon" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "color" SET DATA TYPE VARCHAR(20);

-- AlterTable
ALTER TABLE "settings" ALTER COLUMN "key" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "value" SET DATA TYPE VARCHAR(1000);

-- AlterTable
ALTER TABLE "stock_adjustments" ALTER COLUMN "notes" SET DATA TYPE VARCHAR(500);

-- AlterTable
ALTER TABLE "stock_transfers" ALTER COLUMN "transferNo" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "notes" SET DATA TYPE VARCHAR(500);

-- AlterTable
ALTER TABLE "tenants" ALTER COLUMN "name" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "slug" SET DATA TYPE VARCHAR(100);

-- AlterTable
ALTER TABLE "transaction_items" ALTER COLUMN "productName" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "variantInfo" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "sku" SET DATA TYPE VARCHAR(100);

-- AlterTable
ALTER TABLE "transactions" ALTER COLUMN "customerName" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "customerPhone" SET DATA TYPE VARCHAR(20),
ALTER COLUMN "notes" SET DATA TYPE VARCHAR(1000),
ALTER COLUMN "bankName" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "cardLastDigits" SET DATA TYPE VARCHAR(4),
ALTER COLUMN "referenceNo" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "bankName2" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "referenceNo2" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "externalOrderId" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "externalInvoice" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "externalStatus" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "buyerUsername" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "deviceSource" SET DATA TYPE VARCHAR(50);

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "email" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "password" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "name" SET DATA TYPE VARCHAR(100);

-- AlterTable
ALTER TABLE "variant_options" ALTER COLUMN "value" SET DATA TYPE VARCHAR(100);

-- AlterTable
ALTER TABLE "variant_types" ALTER COLUMN "name" SET DATA TYPE VARCHAR(50);
