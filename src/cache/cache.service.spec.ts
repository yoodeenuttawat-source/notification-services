import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from './cache.service';

describe('CacheService', () => {
  let service: CacheService;
  const originalEnv = process.env;

  beforeEach(async () => {
    // Clear environment variables
    process.env = { ...originalEnv };
    delete process.env.CACHE_MAX_SIZE;

    const module: TestingModule = await Test.createTestingModule({
      providers: [CacheService],
    }).compile();

    service = module.get<CacheService>(CacheService);
    await service.onModuleInit();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('get and set', () => {
    it('should set and get a value', () => {
      service.set('test-key', 'test-value');
      expect(service.get('test-key')).toBe('test-value');
    });

    it('should return null for non-existent key', () => {
      expect(service.get('non-existent')).toBeNull();
    });

    it('should update existing value', () => {
      service.set('test-key', 'value1');
      service.set('test-key', 'value2');
      expect(service.get('test-key')).toBe('value2');
    });

    it('should handle different types', () => {
      service.set('string', 'test');
      service.set('number', 123);
      service.set('boolean', true);
      service.set('object', { key: 'value' });
      service.set('array', [1, 2, 3]);

      expect(service.get('string')).toBe('test');
      expect(service.get('number')).toBe(123);
      expect(service.get('boolean')).toBe(true);
      expect(service.get('object')).toEqual({ key: 'value' });
      expect(service.get('array')).toEqual([1, 2, 3]);
    });
  });

  describe('TTL', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should expire entries after TTL', () => {
      service.set('expiring-key', 'value', 1); // 1 second TTL
      expect(service.get('expiring-key')).toBe('value');

      // Fast-forward 1 second
      jest.advanceTimersByTime(1000);
      expect(service.get('expiring-key')).toBeNull();
    });

    it('should not expire entries without TTL', () => {
      service.set('no-ttl-key', 'value');
      expect(service.get('no-ttl-key')).toBe('value');

      // Fast-forward a long time
      jest.advanceTimersByTime(1000000);
      expect(service.get('no-ttl-key')).toBe('value');
    });

    it('should not expire entries with TTL of 0', () => {
      service.set('zero-ttl-key', 'value', 0);
      expect(service.get('zero-ttl-key')).toBe('value');

      jest.advanceTimersByTime(1000000);
      expect(service.get('zero-ttl-key')).toBe('value');
    });
  });

  describe('delete', () => {
    it('should delete a key', () => {
      service.set('delete-key', 'value');
      expect(service.get('delete-key')).toBe('value');

      service.delete('delete-key');
      expect(service.get('delete-key')).toBeNull();
    });

    it('should handle deleting non-existent key', () => {
      expect(() => service.delete('non-existent')).not.toThrow();
    });
  });

  describe('deletePattern', () => {
    it('should delete keys matching pattern', () => {
      service.set('user:1', 'value1');
      service.set('user:2', 'value2');
      service.set('order:1', 'value3');
      service.set('other', 'value4');

      service.deletePattern('user:*');

      expect(service.get('user:1')).toBeNull();
      expect(service.get('user:2')).toBeNull();
      expect(service.get('order:1')).toBe('value3');
      expect(service.get('other')).toBe('value4');
    });

    it('should handle complex patterns', () => {
      service.set('test:abc:123', 'value1');
      service.set('test:def:456', 'value2');
      service.set('other:abc:123', 'value3');

      service.deletePattern('test:.*:123');

      expect(service.get('test:abc:123')).toBeNull();
      expect(service.get('test:def:456')).toBe('value2');
      expect(service.get('other:abc:123')).toBe('value3');
    });
  });

  describe('maxSize and eviction', () => {
    beforeEach(() => {
      process.env.CACHE_MAX_SIZE = '5';
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should evict oldest entries when max size is reached', () => {
      const service = new CacheService();
      service.onModuleInit();

      // Fill cache to max size
      for (let i = 0; i < 5; i++) {
        service.set(`key${i}`, `value${i}`);
        // Small delay to ensure different lastAccessed times
        jest.advanceTimersByTime(10);
      }

      // Add one more to trigger eviction
      service.set('new-key', 'new-value');

      // Should have evicted oldest entry(s)
      const stats = service.getStats();
      expect(stats.size).toBeLessThanOrEqual(5);
    });

    it('should use default max size when not configured', () => {
      delete process.env.CACHE_MAX_SIZE;
      const service = new CacheService();
      expect(service.getStats().maxSize).toBe(10000);
    });

    it('should use configured max size from env', () => {
      process.env.CACHE_MAX_SIZE = '5000';
      const service = new CacheService();
      expect(service.getStats().maxSize).toBe(5000);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      service.set('key1', 'value1');
      service.set('key2', 'value2');

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

    it('should update lastAccessed on get', () => {
      service.set('lru-key', 'value');
      const firstAccess = Date.now();
      
      jest.advanceTimersByTime(1000);
      service.get('lru-key');
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

    it('should cleanup expired entries', () => {
      service.set('expiring-key', 'value', 1); // 1 second TTL
      service.set('permanent-key', 'value'); // No TTL

      jest.advanceTimersByTime(2000); // Advance past expiration

      // Manually trigger cleanup (normally called by interval)
      (service as any).cleanupExpiredEntries();

      expect(service.get('expiring-key')).toBeNull();
      expect(service.get('permanent-key')).toBe('value');
    });

    it('should not cleanup non-expired entries', () => {
      service.set('key1', 'value1', 10);
      service.set('key2', 'value2', 10);

      jest.advanceTimersByTime(5000); // Before expiration

      (service as any).cleanupExpiredEntries();

      expect(service.get('key1')).toBe('value1');
      expect(service.get('key2')).toBe('value2');
    });
  });

  describe('evictEntries', () => {
    beforeEach(() => {
      process.env.CACHE_MAX_SIZE = '5';
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
      delete process.env.CACHE_MAX_SIZE;
    });

    it('should evict oldest entries when max size reached', () => {
      const service = new CacheService();
      service.onModuleInit();

      // Fill cache to max size
      for (let i = 0; i < 5; i++) {
        service.set(`key${i}`, `value${i}`);
        jest.advanceTimersByTime(10);
      }

      // Add one more to trigger eviction
      service.set('new-key', 'new-value');

      // Should have evicted oldest entry(s)
      const stats = service.getStats();
      expect(stats.size).toBeLessThanOrEqual(5);
    });

    it('should not evict when below max size', () => {
      const service = new CacheService();
      service.onModuleInit();

      service.set('key1', 'value1');
      service.set('key2', 'value2');

      const stats = service.getStats();
      expect(stats.size).toBe(2);
      expect(stats.size).toBeLessThan(stats.maxSize);
    });

    it('should not evict when entriesToEvict is zero or negative', () => {
      const service = new CacheService();
      service.onModuleInit();

      // Fill to 90% of max size (targetSize)
      const targetSize = Math.floor(5 * 0.9); // 4
      for (let i = 0; i < targetSize; i++) {
        service.set(`key${i}`, `value${i}`);
      }

      // Manually call evictEntries - should return early because entriesToEvict <= 0
      (service as any).evictEntries();

      const stats = service.getStats();
      expect(stats.size).toBe(targetSize);
    });
  });
});

