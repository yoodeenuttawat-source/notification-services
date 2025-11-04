import { Injectable, OnModuleInit, Logger } from '@nestjs/common';

interface CacheEntry {
  data: any;
  expiresAt: number;
  lastAccessed: number;
}

@Injectable()
export class CacheService implements OnModuleInit {
  private readonly logger = new Logger(CacheService.name);
  private readonly inMemoryCache: Map<string, CacheEntry> = new Map();
  private readonly maxSize: number;

  constructor() {
    // Default to 10,000 entries, configurable via env var
    this.maxSize = parseInt(process.env.CACHE_MAX_SIZE || '10000', 10);
    this.logger.log(`Cache max size configured: ${this.maxSize} entries`);
  }

  async onModuleInit() {
    this.logger.log(`Using in-memory cache (max size: ${this.maxSize} entries)`);
    // Start cleanup interval to remove expired entries
    setInterval(() => this.cleanupExpiredEntries(), 60000); // Cleanup every minute
  }

  get<T>(key: string): T | null {
    const cached = this.inMemoryCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      // Update last accessed time for LRU
      cached.lastAccessed = Date.now();
      // Move to end of map (most recently used) - Map maintains insertion order
      this.inMemoryCache.delete(key);
      this.inMemoryCache.set(key, cached);
      return cached.data as T;
    }
    
    // Remove expired entry
    if (cached) {
      this.inMemoryCache.delete(key);
    }
    
    return null;
  }

  set(key: string, value: any, ttlSeconds?: number): void {
    // If ttlSeconds is 0 or undefined, set expiresAt to a very large number (effectively never expires)
    const expiresAt = ttlSeconds === undefined || ttlSeconds === 0
      ? Number.MAX_SAFE_INTEGER
      : Date.now() + ttlSeconds * 1000;

    // Check if key already exists (update case)
    if (this.inMemoryCache.has(key)) {
      this.inMemoryCache.set(key, {
        data: value,
        expiresAt: expiresAt,
        lastAccessed: Date.now()
      });
      // Move to end (most recently used)
      const entry = this.inMemoryCache.get(key)!;
      this.inMemoryCache.delete(key);
      this.inMemoryCache.set(key, entry);
      return;
    }

    // Check if we need to evict entries before adding new one
    if (this.inMemoryCache.size >= this.maxSize) {
      this.evictEntries();
    }

    // Add new entry
    this.inMemoryCache.set(key, {
      data: value,
      expiresAt: expiresAt,
      lastAccessed: Date.now()
    });
  }

  delete(key: string): void {
    this.inMemoryCache.delete(key);
  }

  deletePattern(pattern: string): void {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    for (const key of this.inMemoryCache.keys()) {
      if (regex.test(key)) {
        this.inMemoryCache.delete(key);
      }
    }
  }

  /**
   * Cleanup expired entries periodically
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.inMemoryCache.entries()) {
      if (entry.expiresAt <= now) {
        this.inMemoryCache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired cache entries`);
    }
  }

  /**
   * Evict entries when cache reaches max size (LRU policy)
   * Removes oldest 10% of entries or enough to bring size below max
   */
  private evictEntries(): void {
    const currentSize = this.inMemoryCache.size;
    const targetSize = Math.floor(this.maxSize * 0.9); // Evict to 90% of max size
    const entriesToEvict = currentSize - targetSize;
    
    if (entriesToEvict <= 0) {
      return;
    }

    // Sort entries by lastAccessed time (oldest first)
    const entries = Array.from(this.inMemoryCache.entries())
      .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    // Evict oldest entries
    let evicted = 0;
    for (let i = 0; i < entriesToEvict && i < entries.length; i++) {
      this.inMemoryCache.delete(entries[i][0]);
      evicted++;
    }

    if (evicted > 0) {
      this.logger.warn(
        `Cache size limit reached (${currentSize}/${this.maxSize}). Evicted ${evicted} oldest entries (LRU policy). Current size: ${this.inMemoryCache.size}`
      );
    }
  }

  /**
   * Get cache statistics (useful for debugging)
   */
  getStats(): { size: number; maxSize: number; keys: string[] } {
    return {
      size: this.inMemoryCache.size,
      maxSize: this.maxSize,
      keys: Array.from(this.inMemoryCache.keys())
    };
  }
}
