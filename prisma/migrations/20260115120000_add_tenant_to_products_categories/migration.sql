-- AddColumn
ALTER TABLE "categories" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "products" ADD COLUMN "tenantId" TEXT;

-- AlterColumn (assign to first tenant)
DO $$
DECLARE
    first_tenant_id TEXT;
BEGIN
    SELECT id INTO first_tenant_id FROM "tenants" LIMIT 1;
    IF first_tenant_id IS NOT NULL THEN
        UPDATE "categories" SET "tenantId" = first_tenant_id WHERE "tenantId" IS NULL;
        UPDATE "products" SET "tenantId" = first_tenant_id WHERE "tenantId" IS NULL;
    END IF;
END $$;

-- AlterColumn
ALTER TABLE "categories" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "products" ALTER COLUMN "tenantId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "products_tenantId_idx" ON "products"("tenantId");

-- DropIndex
DROP INDEX IF EXISTS "categories_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "categories_tenantId_name_key" ON "categories"("tenantId", "name");
