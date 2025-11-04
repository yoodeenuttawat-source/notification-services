export interface DatabaseConfig {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl?: boolean;
    max?: number;
}
export declare const getDatabaseConfig: () => DatabaseConfig;
