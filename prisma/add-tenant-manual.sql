-- Tenant model setup (manual)
-- Run this manually in your PostgreSQL after you manually drop/recreate database

-- 1. Create tenant table
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  subdomain TEXT UNIQUE NOT NULL,
  "storeName" TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  address TEXT,
  logo TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "maxUsers" INTEGER NOT NULL DEFAULT 999999,
  "maxProducts" INTEGER NOT NULL DEFAULT 999999,
  "maxCabang" INTEGER NOT NULL DEFAULT 999999,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Add tenantId to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
ALTER TABLE users ADD CONSTRAINT users_tenantId_email_key UNIQUE ("tenantId", email);
ALTER TABLE users ADD CONSTRAINT users_tenantId_fkey FOREIGN KEY ("tenantId") REFERENCES tenants(id) ON DELETE CASCADE;

-- 3. Add tenantId to cabang table  
ALTER TABLE cabang ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE cabang DROP CONSTRAINT IF EXISTS cabang_name_key;
ALTER TABLE cabang ADD CONSTRAINT cabang_tenantId_name_key UNIQUE ("tenantId", name);
ALTER TABLE cabang ADD CONSTRAINT cabang_tenantId_fkey FOREIGN KEY ("tenantId") REFERENCES tenants(id) ON DELETE CASCADE;

-- 4. Insert default tenant
INSERT INTO tenants (id, subdomain, "storeName", email, phone, address, "isActive", "createdAt", "updatedAt")
VALUES (
  'default_tenant_001',
  'harapan-abah',
  'Harapan Abah',
  'owner@harapan-abah.com',
  NULL,
  NULL,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT (subdomain) DO NOTHING;

-- 5. Update existing users to belong to default tenant
UPDATE users SET "tenantId" = 'default_tenant_001' WHERE "tenantId" IS NULL;

-- 6. Update existing cabang to belong to default tenant
UPDATE cabang SET "tenantId" = 'default_tenant_001' WHERE "tenantId" IS NULL;

-- 7. Make tenantId NOT NULL after populating
ALTER TABLE users ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE cabang ALTER COLUMN "tenantId" SET NOT NULL;
