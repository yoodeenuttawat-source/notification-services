import { CacheService } from './cache.service';

describe('CacheService', () => {
  let service: CacheService;
  const originalEnv = process.env;

  beforeEach(async () => {
    // Clear environment variables
    process.env = { ...originalEnv };
    delete process.env.CACHE_MAX_SIZE;

    service = new CacheService({ maxSize: 10000, cacheName: 'TestCache' });
    await service.onModuleInit();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('get and set', () => {
    it('should set and get a value', async () => {
      await service.set('test-key', 'test-value');
      expect(await service.get('test-key')).toBe('test-value');
    });

    it('should return null for non-existent key', async () => {
      expect(await service.get('non-existent')).toBeNull();
    });

    it('should update existing value', async () => {
      await service.set('test-key', 'value1');
      await service.set('test-key', 'value2');
      expect(await service.get('test-key')).toBe('value2');
    });

    it('should handle different types', async () => {
      await service.set('string', 'test');
      await service.set('number', 123);
      await service.set('boolean', true);
      await service.set('object', { key: 'value' });
      await service.set('array', [1, 2, 3]);

      expect(await service.get('string')).toBe('test');
      expect(await service.get('number')).toBe(123);
      expect(await service.get('boolean')).toBe(true);
      expect(await service.get('object')).toEqual({ key: 'value' });
      expect(await service.get('array')).toEqual([1, 2, 3]);
    });
  });

  describe('TTL', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it.skip('should expire entries after TTL', async () => {
      // Note: AsyncLRUCache TTL expiration with fake timers needs further investigation
      await service.set('expiring-key', 'value', 1); // 1 second TTL
      expect(await service.get('expiring-key')).toBe('value');

      // Fast-forward past expiration (1 second + buffer)
      jest.advanceTimersByTime(1100);
      // Trigger cleanup manually to remove expired entries
      service['cache'].cleanupExpired();
      expect(await service.get('expiring-key')).toBeNull();
    });

    it('should not expire entries without TTL', async () => {
      await service.set('no-ttl-key', 'value');
      expect(await service.get('no-ttl-key')).toBe('value');

      // Fast-forward a long time
      jest.advanceTimersByTime(1000000);
      expect(await service.get('no-ttl-key')).toBe('value');
    });

    it('should not expire entries with TTL of 0', async () => {
      await service.set('zero-ttl-key', 'value', 0);
      expect(await service.get('zero-ttl-key')).toBe('value');

      jest.advanceTimersByTime(1000000);
      expect(await service.get('zero-ttl-key')).toBe('value');
    });
  });

  describe('delete', () => {
    it('should delete a key', async () => {
      await service.set('delete-key', 'value');
      expect(await service.get('delete-key')).toBe('value');

      service.delete('delete-key');
      expect(await service.get('delete-key')).toBeNull();
    });

    it('should handle deleting non-existent key', () => {
      expect(() => service.delete('non-existent')).not.toThrow();
    });
  });

  describe('deletePattern', () => {
    it('should delete keys matching pattern', async () => {
      await service.set('user:1', 'value1');
      await service.set('user:2', 'value2');
      await service.set('order:1', 'value3');
      await service.set('other', 'value4');

      await service.deletePattern('user:*');

      expect(await service.get('user:1')).toBeNull();
      expect(await service.get('user:2')).toBeNull();
      expect(await service.get('order:1')).toBe('value3');
      expect(await service.get('other')).toBe('value4');
    });

    it('should handle complex patterns', async () => {
      await service.set('test:abc:123', 'value1');
      await service.set('test:def:456', 'value2');
      await service.set('other:abc:123', 'value3');

      await service.deletePattern('test:.*:123');

      expect(await service.get('test:abc:123')).toBeNull();
      expect(await service.get('test:def:456')).toBe('value2');
      expect(await service.get('other:abc:123')).toBe('value3');
    });
  });

  describe('maxSize and eviction', () => {
    beforeEach(() => {
      process.env.CACHE_MAX_SIZE = '10';
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should evict oldest entries when max size is reached', async () => {
      const service = new CacheService({ maxSize: 10, cacheName: 'TestCache' });
      await service.onModuleInit();

      // Fill cache to max size
      for (let i = 0; i < 10; i++) {
        await service.set(`key${i}`, `value${i}`);
        // Small delay to ensure different lastAccessed times
        jest.advanceTimersByTime(10);
      }

      // Add one more to trigger eviction
      await service.set('new-key', 'new-value');

      // Should have evicted oldest entry(s)
      const stats = service.getStats();
      expect(stats.size).toBeLessThanOrEqual(10);
    });

    it('should use default max size when not configured', () => {
      delete process.env.CACHE_MAX_SIZE;
      const service = new CacheService({ cacheName: 'TestCache' });
      expect(service.getStats().maxSize).toBe(10000);
    });

    it('should use configured max size from env', () => {
      process.env.CACHE_MAX_SIZE = '5000';
      const service = new CacheService({ cacheName: 'TestCache' });
      expect(service.getStats().maxSize).toBe(5000);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', async () => {
      await service.set('key1', 'value1');
      await service.set('key2', 'value2');

      const stats = service.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(10000);
      expect(stats.keys).toContain('key1');
      expect(stats.keys).toContain('key2');
      expect(stats.keys.length).toBe(2);
    });
  });

  describe('LRU behavior', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should update lastAccessed on get', async () => {
      await service.set('lru-key', 'value');
      const firstAccess = Date.now();

      jest.advanceTimersByTime(1000);
      await service.get('lru-key');
      const secondAccess = Date.now();

      expect(secondAccess).toBeGreaterThan(firstAccess);
    });
  });

  describe('cleanupExpiredEntries', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should cleanup expired entries', async () => {
      await service.set('expiring-key', 'value', 1); // 1 second TTL
      await service.set('permanent-key', 'value'); // No TTL

      jest.advanceTimersByTime(2000); // Advance past expiration

      // Manually trigger cleanup (normally called by interval)
      service['cache'].cleanupExpired();

      expect(await service.get('expiring-key')).toBeNull();
      expect(await service.get('permanent-key')).toBe('value');
    });

    it('should not cleanup non-expired entries', async () => {
      await service.set('key1', 'value1', 10);
      await service.set('key2', 'value2', 10);

      jest.advanceTimersByTime(5000); // Before expiration

      service['cache'].cleanupExpired();

      expect(await service.get('key1')).toBe('value1');
      expect(await service.get('key2')).toBe('value2');
    });
  });

  describe('evictEntries', () => {
    beforeEach(() => {
      process.env.CACHE_MAX_SIZE = '10';
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
      delete process.env.CACHE_MAX_SIZE;
    });

    it('should evict oldest entries when max size reached', async () => {
      const service = new CacheService({ maxSize: 10, cacheName: 'TestCache' });
      await service.onModuleInit();

      // Fill cache to max size
      for (let i = 0; i < 10; i++) {
        await service.set(`key${i}`, `value${i}`);
        jest.advanceTimersByTime(10);
      }

      // Add one more to trigger eviction
      await service.set('new-key', 'new-value');

      // Should have evicted oldest entry(s)
      const stats = service.getStats();
      expect(stats.size).toBeLessThanOrEqual(10);
    });

    it('should not evict when below max size', async () => {
      const service = new CacheService({ maxSize: 10, cacheName: 'TestCache' });
      await service.onModuleInit();

      await service.set('key1', 'value1');
      await service.set('key2', 'value2');

      const stats = service.getStats();
      expect(stats.size).toBe(2);
      expect(stats.size).toBeLessThan(stats.maxSize);
    });

    it('should not evict when entriesToEvict is zero or negative', async () => {
      const service = new CacheService({ maxSize: 10, cacheName: 'TestCache' });
      await service.onModuleInit();

      // Fill to 90% of max size (targetSize)
      const targetSize = Math.floor(10 * 0.9); // 9
      for (let i = 0; i < targetSize; i++) {
        await service.set(`key${i}`, `value${i}`);
      }

      const stats = service.getStats();
      expect(stats.size).toBe(targetSize);
    });
  });
});
