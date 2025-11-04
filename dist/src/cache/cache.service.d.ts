import { OnModuleInit } from '@nestjs/common';
export interface CacheServiceOptions {
    maxSize?: number;
    cacheName?: string;
}
export declare class CacheService implements OnModuleInit {
    private readonly logger;
    private readonly cache;
    private readonly maxSize;
    private readonly cacheName;
    private readonly keyIndex;
    constructor(options?: CacheServiceOptions);
    onModuleInit(): Promise<void>;
    private cleanupKeyIndex;
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: any, ttlSeconds?: number): Promise<void>;
    delete(key: string): void;
    deletePattern(pattern: string): Promise<void>;
    getStats(): {
        size: number;
        maxSize: number;
        keys: string[];
    };
}
