-- Delete transaction items for inactive products
DELETE FROM "transaction_items" 
WHERE "productVariantId" IN (
  SELECT id FROM "product_variants" 
  WHERE "productId" IN (
    SELECT id FROM "products" WHERE "isActive" = false
  )
);

-- Delete stock records for inactive products
DELETE FROM "stocks" 
WHERE "productVariantId" IN (
  SELECT id FROM "product_variants" 
  WHERE "productId" IN (
    SELECT id FROM "products" WHERE "isActive" = false
  )
);

-- Delete product variants for inactive products
DELETE FROM "product_variants" 
WHERE "productId" IN (
  SELECT id FROM "products" WHERE "isActive" = false
);

-- Delete inactive products
DELETE FROM "products" WHERE "isActive" = false;
