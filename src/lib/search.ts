/**
 * PostgreSQL Full-Text Search Helper
 * 
 * Provides FTS capabilities with fallback to LIKE queries
 */

import prisma from './prisma.js';
import logger from './logger.js';

/**
 * Check if FTS is available (search_vector column exists)
 */
let ftsAvailable: boolean | null = null;

export async function isFTSAvailable(): Promise<boolean> {
  if (ftsAvailable !== null) return ftsAvailable;
  
  try {
    // Check if search_vector column exists
    const result = await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'search_vector'
      ) as exists
    `;
    ftsAvailable = result[0]?.exists ?? false;
    logger.info(`[FTS] Full-text search ${ftsAvailable ? 'available' : 'not available'}`);
    return ftsAvailable;
  } catch (error) {
    logger.warn('[FTS] Could not check FTS availability, falling back to LIKE');
    ftsAvailable = false;
    return false;
  }
}

/**
 * Convert search query to tsquery format
 * Handles multiple words and prefixes
 */
export function toTsQuery(searchTerm: string): string {
  const words = searchTerm
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 0)
    .map(w => w.replace(/[^a-zA-Z0-9]/g, '') + ':*'); // Prefix search
  
  return words.join(' & '); // AND all words
}

/**
 * Search products using FTS with fallback to LIKE
 */
export interface FTSSearchParams {
  tenantId: string;
  searchTerm: string;
  categoryId?: string;
  status?: string;
  page: number;
  limit: number;
}

export interface FTSSearchResult {
  productIds: string[];
  totalCount: number;
  usedFTS: boolean;
}

export async function searchProducts(params: FTSSearchParams): Promise<FTSSearchResult> {
  const { tenantId, searchTerm, page, limit } = params;
  const skip = (page - 1) * limit;
  
  const useFTS = await isFTSAvailable();
  
  if (useFTS && searchTerm.length >= 2) {
    try {
      const tsQuery = toTsQuery(searchTerm);
      
      // Use raw query for FTS
      const results = await prisma.$queryRaw<{ id: string; rank: number }[]>`
        SELECT 
          p.id,
          ts_rank(p.search_vector, to_tsquery('indonesian', ${tsQuery})) as rank
        FROM products p
        WHERE p."tenantId" = ${tenantId}
          AND p.search_vector @@ to_tsquery('indonesian', ${tsQuery})
        ORDER BY rank DESC
        LIMIT ${limit}
        OFFSET ${skip}
      `;
      
      const countResult = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count
        FROM products p
        WHERE p."tenantId" = ${tenantId}
          AND p.search_vector @@ to_tsquery('indonesian', ${tsQuery})
      `;
      
      return {
        productIds: results.map(r => r.id),
        totalCount: Number(countResult[0]?.count ?? 0),
        usedFTS: true,
      };
    } catch (error) {
      logger.warn('[FTS] FTS query failed, falling back to LIKE', { error });
      // Fall through to LIKE search
    }
  }
  
  // Fallback to LIKE search (current implementation)
  // This just returns empty to indicate caller should use Prisma's contains
  return {
    productIds: [],
    totalCount: 0,
    usedFTS: false,
  };
}
