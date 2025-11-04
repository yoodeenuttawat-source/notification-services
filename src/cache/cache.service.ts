import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class CacheService implements OnModuleInit {
  private readonly logger = new Logger(CacheService.name);
  private redis: Redis | null = null;
  private inMemoryCache: Map<string, { data: any; expiresAt: number }> = new Map();

  constructor() {
    // Try to connect to Redis, fallback to in-memory
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      this.redis = new Redis(redisUrl);
      this.redis.on('error', (error) => {
        this.logger.warn('Redis connection error, falling back to in-memory cache:', error);
        this.redis = null;
      });
    }
  }

  async onModuleInit() {
    if (this.redis) {
      try {
        await this.redis.ping();
        this.logger.log('Redis cache connected');
      } catch (error) {
        this.logger.warn('Redis unavailable, using in-memory cache');
        this.redis = null;
      }
    } else {
      this.logger.log('Using in-memory cache (Redis not configured)');
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.redis) {
      try {
        const value = await this.redis.get(key);
        return value ? JSON.parse(value) : null;
      } catch (error) {
        this.logger.error(`Cache get error for key ${key}:`, error);
        return null;
      }
    }

    // In-memory fallback
    const cached = this.inMemoryCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as T;
    }
    this.inMemoryCache.delete(key);
    return null;
  }

  async set(key: string, value: any, ttlSeconds: number = 300): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
        return;
      } catch (error) {
        this.logger.error(`Cache set error for key ${key}:`, error);
        // Fall through to in-memory
      }
    }

    // In-memory fallback
    this.inMemoryCache.set(key, {
      data: value,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }

  async delete(key: string): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.del(key);
        return;
      } catch (error) {
        this.logger.error(`Cache delete error for key ${key}:`, error);
      }
    }

    this.inMemoryCache.delete(key);
  }

  async deletePattern(pattern: string): Promise<void> {
    if (this.redis) {
      try {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } catch (error) {
        this.logger.error(`Cache delete pattern error for ${pattern}:`, error);
      }
    } else {
      // In-memory pattern matching
      for (const key of this.inMemoryCache.keys()) {
        if (this.matchesPattern(key, pattern)) {
          this.inMemoryCache.delete(key);
        }
      }
    }
  }

  private matchesPattern(key: string, pattern: string): boolean {
    const regex = new RegExp(pattern.replace('*', '.*'));
    return regex.test(key);
  }
}
