-- PostgreSQL Full-Text Search for Products
-- This migration adds FTS capability for faster product search

-- 1. Add search vector column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- 2. Create GIN index for fast searching
CREATE INDEX IF NOT EXISTS products_search_idx ON products USING GIN(search_vector);

-- 3. Create function to update search vector
CREATE OR REPLACE FUNCTION update_product_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('indonesian', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('indonesian', coalesce(NEW.description, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create trigger to auto-update search vector
DROP TRIGGER IF EXISTS products_search_vector_trigger ON products;
CREATE TRIGGER products_search_vector_trigger
BEFORE INSERT OR UPDATE OF name, description
ON products
FOR EACH ROW
EXECUTE FUNCTION update_product_search_vector();

-- 5. Backfill existing data
UPDATE products SET search_vector = 
  setweight(to_tsvector('indonesian', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('indonesian', coalesce(description, '')), 'B');

-- Note: For variants, we'll use a separate approach with JOIN queries
-- since variants are in a separate table
