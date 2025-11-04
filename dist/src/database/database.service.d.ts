import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
export declare class DatabaseService implements OnModuleInit, OnModuleDestroy {
    private pool;
    constructor();
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    getClient(): Promise<PoolClient>;
    query<T = any>(text: string, params?: any[]): Promise<{
        rows: T[];
        rowCount: number;
    }>;
    transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T>;
    callProcedure<T = any>(procedureName: string, params?: any[]): Promise<{
        rows: T[];
        rowCount: number;
    }>;
    getPool(): Pool;
}
