-- CreateTable
CREATE TABLE IF NOT EXISTS "stock_alerts" (
    "id" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "cabangId" TEXT NOT NULL,
    "minStock" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_alerts_productVariantId_cabangId_key" ON "stock_alerts"("productVariantId", "cabangId");

-- AddForeignKey
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_cabangId_fkey" FOREIGN KEY ("cabangId") REFERENCES "cabang"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
