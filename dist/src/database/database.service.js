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
exports.DatabaseService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const database_config_1 = require("../config/database.config");
let DatabaseService = class DatabaseService {
    constructor() {
        const config = (0, database_config_1.getDatabaseConfig)();
        this.pool = new pg_1.Pool(config);
    }
    async onModuleInit() {
        try {
            await this.pool.query('SELECT NOW()');
            console.log('Database connected successfully');
        }
        catch (error) {
            console.error('Database connection failed:', error);
            throw error;
        }
    }
    async onModuleDestroy() {
        await this.pool.end();
    }
    async getClient() {
        return await this.pool.connect();
    }
    async query(text, params) {
        const result = await this.pool.query(text, params);
        return {
            rows: result.rows,
            rowCount: result.rowCount || 0
        };
    }
    async transaction(callback) {
        const client = await this.getClient();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async callProcedure(procedureName, params) {
        const paramPlaceholders = params ? params.map((_, i) => `$${i + 1}`).join(', ') : '';
        const query = `SELECT * FROM ${procedureName}(${paramPlaceholders})`;
        const result = await this.pool.query(query, params);
        return {
            rows: result.rows,
            rowCount: result.rowCount || 0
        };
    }
    getPool() {
        return this.pool;
    }
};
exports.DatabaseService = DatabaseService;
exports.DatabaseService = DatabaseService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], DatabaseService);
//# sourceMappingURL=database.service.js.map