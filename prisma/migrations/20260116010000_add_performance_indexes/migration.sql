-- Add performance indexes for common queries (if not exists)

-- Transaction indexes for date range queries
CREATE INDEX IF NOT EXISTS "transactions_cabangId_createdAt_idx" ON "transactions"("cabangId", "createdAt");
CREATE INDEX IF NOT EXISTS "transactions_kasirId_createdAt_idx" ON "transactions"("kasirId", "createdAt");
CREATE INDEX IF NOT EXISTS "transactions_channelId_status_idx" ON "transactions"("channelId", "status");

-- Product indexes for filtering
CREATE INDEX IF NOT EXISTS "products_tenantId_idx" ON "products"("tenantId");
CREATE INDEX IF NOT EXISTS "products_categoryId_idx" ON "products"("categoryId");
CREATE INDEX IF NOT EXISTS "products_tenantId_isActive_idx" ON "products"("tenantId", "isActive");

-- Category indexes
CREATE INDEX IF NOT EXISTS "categories_tenantId_idx" ON "categories"("tenantId");

-- Settings indexes
CREATE INDEX IF NOT EXISTS "settings_tenantId_idx" ON "settings"("tenantId");
