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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var CacheService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheService = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = __importDefault(require("ioredis"));
let CacheService = CacheService_1 = class CacheService {
    constructor() {
        this.logger = new common_1.Logger(CacheService_1.name);
        this.redis = null;
        this.inMemoryCache = new Map();
        const redisUrl = process.env.REDIS_URL;
        if (redisUrl) {
            this.redis = new ioredis_1.default(redisUrl);
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
            }
            catch (error) {
                this.logger.warn('Redis unavailable, using in-memory cache');
                this.redis = null;
            }
        }
        else {
            this.logger.log('Using in-memory cache (Redis not configured)');
        }
    }
    async get(key) {
        if (this.redis) {
            try {
                const value = await this.redis.get(key);
                return value ? JSON.parse(value) : null;
            }
            catch (error) {
                this.logger.error(`Cache get error for key ${key}:`, error);
                return null;
            }
        }
        const cached = this.inMemoryCache.get(key);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.data;
        }
        this.inMemoryCache.delete(key);
        return null;
    }
    async set(key, value, ttlSeconds = 300) {
        if (this.redis) {
            try {
                await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
                return;
            }
            catch (error) {
                this.logger.error(`Cache set error for key ${key}:`, error);
            }
        }
        this.inMemoryCache.set(key, {
            data: value,
            expiresAt: Date.now() + ttlSeconds * 1000
        });
    }
    async delete(key) {
        if (this.redis) {
            try {
                await this.redis.del(key);
                return;
            }
            catch (error) {
                this.logger.error(`Cache delete error for key ${key}:`, error);
            }
        }
        this.inMemoryCache.delete(key);
    }
    async deletePattern(pattern) {
        if (this.redis) {
            try {
                const keys = await this.redis.keys(pattern);
                if (keys.length > 0) {
                    await this.redis.del(...keys);
                }
            }
            catch (error) {
                this.logger.error(`Cache delete pattern error for ${pattern}:`, error);
            }
        }
        else {
            for (const key of this.inMemoryCache.keys()) {
                if (this.matchesPattern(key, pattern)) {
                    this.inMemoryCache.delete(key);
                }
            }
        }
    }
    matchesPattern(key, pattern) {
        const regex = new RegExp(pattern.replace('*', '.*'));
        return regex.test(key);
    }
};
exports.CacheService = CacheService;
exports.CacheService = CacheService = CacheService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], CacheService);
//# sourceMappingURL=cache.service.js.map