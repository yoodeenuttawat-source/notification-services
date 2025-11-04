import { OnModuleInit } from '@nestjs/common';
export declare class CacheService implements OnModuleInit {
    private readonly logger;
    private readonly inMemoryCache;
    private readonly maxSize;
    constructor();
    onModuleInit(): Promise<void>;
    get<T>(key: string): T | null;
    set(key: string, value: any, ttlSeconds?: number): void;
    delete(key: string): void;
    deletePattern(pattern: string): void;
    private cleanupExpiredEntries;
    private evictEntries;
    getStats(): {
        size: number;
        maxSize: number;
        keys: string[];
    };
}
