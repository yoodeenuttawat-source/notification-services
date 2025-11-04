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
var CacheService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheService = void 0;
const common_1 = require("@nestjs/common");
let CacheService = CacheService_1 = class CacheService {
    constructor() {
        this.logger = new common_1.Logger(CacheService_1.name);
        this.inMemoryCache = new Map();
        this.maxSize = parseInt(process.env.CACHE_MAX_SIZE || '10000', 10);
        this.logger.log(`Cache max size configured: ${this.maxSize} entries`);
    }
    async onModuleInit() {
        this.logger.log(`Using in-memory cache (max size: ${this.maxSize} entries)`);
        setInterval(() => this.cleanupExpiredEntries(), 60000);
    }
    get(key) {
        const cached = this.inMemoryCache.get(key);
        if (cached && cached.expiresAt > Date.now()) {
            cached.lastAccessed = Date.now();
            this.inMemoryCache.delete(key);
            this.inMemoryCache.set(key, cached);
            return cached.data;
        }
        if (cached) {
            this.inMemoryCache.delete(key);
        }
        return null;
    }
    set(key, value, ttlSeconds) {
        const expiresAt = ttlSeconds === undefined || ttlSeconds === 0
            ? Number.MAX_SAFE_INTEGER
            : Date.now() + ttlSeconds * 1000;
        if (this.inMemoryCache.has(key)) {
            this.inMemoryCache.set(key, {
                data: value,
                expiresAt: expiresAt,
                lastAccessed: Date.now(),
            });
            const entry = this.inMemoryCache.get(key);
            this.inMemoryCache.delete(key);
            this.inMemoryCache.set(key, entry);
            return;
        }
        if (this.inMemoryCache.size >= this.maxSize) {
            this.evictEntries();
        }
        this.inMemoryCache.set(key, {
            data: value,
            expiresAt: expiresAt,
            lastAccessed: Date.now(),
        });
    }
    delete(key) {
        this.inMemoryCache.delete(key);
    }
    deletePattern(pattern) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        for (const key of this.inMemoryCache.keys()) {
            if (regex.test(key)) {
                this.inMemoryCache.delete(key);
            }
        }
    }
    cleanupExpiredEntries() {
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
    evictEntries() {
        const currentSize = this.inMemoryCache.size;
        const targetSize = Math.floor(this.maxSize * 0.9);
        const entriesToEvict = currentSize - targetSize;
        if (entriesToEvict <= 0) {
            return;
        }
        const entries = Array.from(this.inMemoryCache.entries()).sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
        let evicted = 0;
        for (let i = 0; i < entriesToEvict && i < entries.length; i++) {
            this.inMemoryCache.delete(entries[i][0]);
            evicted++;
        }
        if (evicted > 0) {
            this.logger.warn(`Cache size limit reached (${currentSize}/${this.maxSize}). Evicted ${evicted} oldest entries (LRU policy). Current size: ${this.inMemoryCache.size}`);
        }
    }
    getStats() {
        return {
            size: this.inMemoryCache.size,
            maxSize: this.maxSize,
            keys: Array.from(this.inMemoryCache.keys()),
        };
    }
};
exports.CacheService = CacheService;
exports.CacheService = CacheService = CacheService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], CacheService);
//# sourceMappingURL=cache.service.js.map