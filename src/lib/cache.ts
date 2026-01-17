/**
 * Redis Caching Helper
 * Provides caching layer with automatic fallback to in-memory storage
 */

import { getRedis, isRedisAvailable } from './redis.js';
import logger from './logger.js';

// In-memory cache fallback (Map with TTL)
class MemoryCache {
  private cache: Map<string, { value: any; expiry: number }> = new Map();

  set(key: string, value: any, ttlSeconds: number): void {
    const expiry = Date.now() + ttlSeconds * 1000;
    this.cache.set(key, { value, expiry });
  }

  get(key: string): any | null {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }

  del(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  // Cleanup expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        this.cache.delete(key);
      }
    }
  }
}

const memoryCache = new MemoryCache();

// Cleanup expired entries every 5 minutes
setInterval(() => memoryCache.cleanup(), 5 * 60 * 1000);

/**
 * Cache TTL constants (in seconds)
 */
export const CACHE_TTL = {
  SHORT: 60,           // 1 minute
  MEDIUM: 300,         // 5 minutes
  LONG: 1800,          // 30 minutes
  VERY_LONG: 3600,     // 1 hour
  DAY: 86400,          // 24 hours
};

/**
 * Get cached value
 */
export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedis();
    
    if (isRedisAvailable() && redis) {
      const value = await redis.get(key);
      if (value) {
        return JSON.parse(value) as T;
      }
      return null;
    }
    
    // Fallback to memory cache
    return memoryCache.get(key) as T | null;
  } catch (error) {
    logger.error('[Cache] Get error', { key, error });
    return null;
  }
}

/**
 * Set cached value with TTL
 */
export async function setCache(key: string, value: any, ttlSeconds: number = CACHE_TTL.MEDIUM): Promise<void> {
  try {
    const redis = getRedis();
    
    if (isRedisAvailable() && redis) {
      await redis.setex(key, ttlSeconds, JSON.stringify(value));
      return;
    }
    
    // Fallback to memory cache
    memoryCache.set(key, value, ttlSeconds);
  } catch (error) {
    logger.error('[Cache] Set error', { key, error });
  }
}

/**
 * Delete cached value
 */
export async function delCache(key: string): Promise<void> {
  try {
    const redis = getRedis();
    
    if (isRedisAvailable() && redis) {
      await redis.del(key);
      return;
    }
    
    // Fallback to memory cache
    memoryCache.del(key);
  } catch (error) {
    logger.error('[Cache] Delete error', { key, error });
  }
}

/**
 * Delete multiple cached values by pattern (Redis only)
 */
export async function delCachePattern(pattern: string): Promise<void> {
  try {
    const redis = getRedis();
    
    if (isRedisAvailable() && redis) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      return;
    }
    
    // Memory cache: clear all if pattern matches (simple implementation)
    if (pattern.includes('*')) {
      const basePattern = pattern.replace(/\*/g, '');
      const keys = Array.from((memoryCache as any).cache.keys()) as string[];
      for (const key of keys) {
        if (key.includes(basePattern)) {
          memoryCache.del(key);
        }
      }
    }
  } catch (error) {
    logger.error('[Cache] Delete pattern error', { pattern, error });
  }
}

/**
 * Get or set cache with fallback to generator function
 */
export async function getCacheOrSet<T>(
  key: string,
  generator: () => Promise<T>,
  ttlSeconds: number = CACHE_TTL.MEDIUM
): Promise<T> {
  // Try to get from cache first
  const cached = await getCache<T>(key);
  if (cached !== null) {
    return cached;
  }
  
  // Generate new value
  const value = await generator();
  
  // Cache it
  await setCache(key, value, ttlSeconds);
  
  return value;
}

/**
 * Cache key generators
 */
export const CacheKeys = {
  products: (tenantId: string, filters?: string) => 
    `products:${tenantId}${filters ? `:${filters}` : ''}`,
  
  product: (productId: string) => 
    `product:${productId}`,
  
  categories: (tenantId: string) => 
    `categories:${tenantId}`,
  
  category: (categoryId: string) => 
    `category:${categoryId}`,
  
  stock: (variantId: string, cabangId: string) => 
    `stock:${variantId}:${cabangId}`,
  
  stocks: (cabangId: string) => 
    `stocks:${cabangId}`,
  
  tenant: (tenantId: string) => 
    `tenant:${tenantId}`,
  
  user: (userId: string) => 
    `user:${userId}`,
};

/**
 * Clear tenant-related caches
 */
export async function clearTenantCache(tenantId: string): Promise<void> {
  await delCachePattern(`*:${tenantId}:*`);
  await delCachePattern(`products:${tenantId}*`);
  await delCachePattern(`categories:${tenantId}`);
}

/**
 * Clear product-related caches
 */
export async function clearProductCache(tenantId: string, productId?: string): Promise<void> {
  if (productId) {
    await delCache(CacheKeys.product(productId));
  }
  await delCachePattern(`products:${tenantId}*`);
}

/**
 * Clear category-related caches
 */
export async function clearCategoryCache(tenantId: string, categoryId?: string): Promise<void> {
  if (categoryId) {
    await delCache(CacheKeys.category(categoryId));
  }
  await delCache(CacheKeys.categories(tenantId));
  await delCachePattern(`products:${tenantId}*`); // Products include category
}

/**
 * Clear stock-related caches
 */
export async function clearStockCache(cabangId: string, variantId?: string): Promise<void> {
  if (variantId) {
    await delCache(CacheKeys.stock(variantId, cabangId));
  }
  await delCache(CacheKeys.stocks(cabangId));
}
