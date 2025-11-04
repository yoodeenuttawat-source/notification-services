import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { AsyncLRUCache } from '@wfp99/async-lru-cache';

export interface CacheServiceOptions {
  maxSize?: number;
  cacheName?: string;
}

@Injectable()
export class CacheService implements OnModuleInit {
  private readonly logger: Logger;
  private readonly cache: AsyncLRUCache<string, any>;
  private readonly maxSize: number;
  private readonly cacheName: string;
  // Track keys for pattern deletion support
  private readonly keyIndex: Set<string> = new Set();

  constructor(options?: CacheServiceOptions) {
    const maxSizeEnv = options?.maxSize || parseInt(process.env.CACHE_MAX_SIZE || '10000', 10);
    this.maxSize = maxSizeEnv;
    this.cacheName = options?.cacheName || 'CacheService';
    this.logger = new Logger(this.cacheName);

    // Create async LRU cache with concurrent access support
    this.cache = new AsyncLRUCache<string, any>({
      capacity: this.maxSize,
      // Default TTL of 0 means no expiration by default (we'll set per-item TTL)
      defaultTtlMs: 0,
    });

    this.logger.log(`Cache max size configured: ${this.maxSize} entries`);
  }

  async onModuleInit() {
    this.logger.log(
      `[${this.cacheName}] Using in-memory LRU cache with concurrent support (max size: ${this.maxSize} entries)`
    );
    // Start cleanup interval to remove expired entries
    setInterval(() => {
      this.cache.cleanupExpired();
      // Clean up expired keys from keyIndex
      this.cleanupKeyIndex();
    }, 60000); // Cleanup every minute
  }

  /**
   * Clean up expired keys from keyIndex
   */
  private cleanupKeyIndex(): void {
    // Remove keys from index that are no longer in cache
    for (const key of this.keyIndex) {
      if (!this.cache.has(key)) {
        this.keyIndex.delete(key);
      }
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      // Check if key exists first (sync check)
      if (!this.cache.has(key)) {
        return null;
      }

      // Use get() with a loader that throws to indicate cache miss
      // This ensures we only get cached values, not load new ones
      // The cache will handle concurrency and merge concurrent requests
      const value = await this.cache.get(key, async () => {
        // This should not be called if has() returns true
        // But if race condition occurs, throw to indicate cache miss
        throw new Error('CACHE_MISS');
      });

      return value !== null && value !== undefined ? (value as T) : null;
    } catch (error: any) {
      // Handle cache miss (loader threw error)
      if (error?.message === 'CACHE_MISS') {
        return null;
      }
      this.logger.error(`Error getting cache key "${key}":`, error);
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    try {
      const ttlMs =
        ttlSeconds === undefined || ttlSeconds === 0
          ? undefined // No expiration
          : ttlSeconds * 1000; // Convert to milliseconds

      await this.cache.put(key, value, undefined, ttlMs);
      // Track key for pattern deletion
      this.keyIndex.add(key);
    } catch (error) {
      this.logger.error(`Error setting cache key "${key}":`, error);
    }
  }

  delete(key: string): void {
    try {
      this.cache.invalidate(key);
      this.keyIndex.delete(key);
    } catch (error) {
      this.logger.error(`Error deleting cache key "${key}":`, error);
    }
  }

  async deletePattern(pattern: string): Promise<void> {
    try {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      const keysToDelete: string[] = [];

      // Collect keys matching the pattern
      for (const key of this.keyIndex) {
        if (regex.test(key)) {
          keysToDelete.push(key);
        }
      }

      // Delete collected keys
      for (const key of keysToDelete) {
        this.cache.invalidate(key);
        this.keyIndex.delete(key);
      }

      if (keysToDelete.length > 0) {
        this.logger.debug(`Deleted ${keysToDelete.length} keys matching pattern "${pattern}"`);
      }
    } catch (error) {
      this.logger.error(`Error deleting cache pattern "${pattern}":`, error);
    }
  }

  /**
   * Get cache statistics (useful for debugging)
   */
  getStats(): { size: number; maxSize: number; keys: string[] } {
    try {
      return {
        size: this.cache.size(),
        maxSize: this.maxSize,
        keys: Array.from(this.keyIndex),
      };
    } catch (error) {
      this.logger.error('Error getting cache stats:', error);
      return {
        size: 0,
        maxSize: this.maxSize,
        keys: [],
      };
    }
  }
}
