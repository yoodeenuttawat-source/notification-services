"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheService = void 0;
const common_1 = require("@nestjs/common");
const async_lru_cache_1 = require("@wfp99/async-lru-cache");
let CacheService = class CacheService {
    constructor(options) {
        this.keyIndex = new Set();
        const maxSizeEnv = options?.maxSize || parseInt(process.env.CACHE_MAX_SIZE || '10000', 10);
        this.maxSize = maxSizeEnv;
        this.cacheName = options?.cacheName || 'CacheService';
        this.logger = new common_1.Logger(this.cacheName);
        this.cache = new async_lru_cache_1.AsyncLRUCache({
            capacity: this.maxSize,
            defaultTtlMs: 0,
        });
        this.logger.log(`Cache max size configured: ${this.maxSize} entries`);
    }
    async onModuleInit() {
        this.logger.log(`[${this.cacheName}] Using in-memory LRU cache with concurrent support (max size: ${this.maxSize} entries)`);
        setInterval(() => {
            this.cache.cleanupExpired();
            this.cleanupKeyIndex();
        }, 60000);
    }
    cleanupKeyIndex() {
        for (const key of this.keyIndex) {
            if (!this.cache.has(key)) {
                this.keyIndex.delete(key);
            }
        }
    }
    async get(key) {
        try {
            if (!this.cache.has(key)) {
                return null;
            }
            const value = await this.cache.get(key, async () => {
                throw new Error('CACHE_MISS');
            });
            return value !== null && value !== undefined ? value : null;
        }
        catch (error) {
            if (error?.message === 'CACHE_MISS') {
                return null;
            }
            this.logger.error(`Error getting cache key "${key}":`, error);
            return null;
        }
    }
    async set(key, value, ttlSeconds) {
        try {
            const ttlMs = ttlSeconds === undefined || ttlSeconds === 0
                ? undefined
                : ttlSeconds * 1000;
            await this.cache.put(key, value, undefined, ttlMs);
            this.keyIndex.add(key);
        }
        catch (error) {
            this.logger.error(`Error setting cache key "${key}":`, error);
        }
    }
    delete(key) {
        try {
            this.cache.invalidate(key);
            this.keyIndex.delete(key);
        }
        catch (error) {
            this.logger.error(`Error deleting cache key "${key}":`, error);
        }
    }
    async deletePattern(pattern) {
        try {
            const regex = new RegExp(pattern.replace(/\*/g, '.*'));
            const keysToDelete = [];
            for (const key of this.keyIndex) {
                if (regex.test(key)) {
                    keysToDelete.push(key);
                }
            }
            for (const key of keysToDelete) {
                this.cache.invalidate(key);
                this.keyIndex.delete(key);
            }
            if (keysToDelete.length > 0) {
                this.logger.debug(`Deleted ${keysToDelete.length} keys matching pattern "${pattern}"`);
            }
        }
        catch (error) {
            this.logger.error(`Error deleting cache pattern "${pattern}":`, error);
        }
    }
    getStats() {
        try {
            return {
                size: this.cache.size(),
                maxSize: this.maxSize,
                keys: Array.from(this.keyIndex),
            };
        }
        catch (error) {
            this.logger.error('Error getting cache stats:', error);
            return {
                size: 0,
                maxSize: this.maxSize,
                keys: [],
            };
        }
    }
};
exports.CacheService = CacheService;
exports.CacheService = CacheService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [Object])
], CacheService);
//# sourceMappingURL=cache.service.js.map