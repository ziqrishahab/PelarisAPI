-- AddColumn
ALTER TABLE "settings" ADD COLUMN "tenantId" TEXT;

-- AlterColumn (assign to first tenant for existing records)
DO $$
DECLARE
    first_tenant_id TEXT;
BEGIN
    SELECT id INTO first_tenant_id FROM "tenants" LIMIT 1;
    IF first_tenant_id IS NOT NULL THEN
        UPDATE "settings" SET "tenantId" = first_tenant_id WHERE "tenantId" IS NULL;
    END IF;
END $$;

-- AlterColumn
ALTER TABLE "settings" ALTER COLUMN "tenantId" SET NOT NULL;

-- DropIndex
DROP INDEX IF EXISTS "settings_key_key";

-- CreateIndex
CREATE UNIQUE INDEX "settings_tenantId_key_key" ON "settings"("tenantId", "key");

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
