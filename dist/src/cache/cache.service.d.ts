import { OnModuleInit } from '@nestjs/common';
export declare class CacheService implements OnModuleInit {
    private readonly logger;
    private redis;
    private inMemoryCache;
    constructor();
    onModuleInit(): Promise<void>;
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: any, ttlSeconds?: number): Promise<void>;
    delete(key: string): Promise<void>;
    deletePattern(pattern: string): Promise<void>;
    private matchesPattern;
}
