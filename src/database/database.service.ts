import { Injectable, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { getDatabaseConfig } from '../config/database.config';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool;

  constructor(@Optional() private readonly metricsService?: MetricsService) {
    const config = getDatabaseConfig();
    this.pool = new Pool(config);
  }

  async onModuleInit() {
    // Test connection
    try {
      await this.pool.query('SELECT NOW()');
      console.log('Database connected successfully');
    } catch (error) {
      console.error('Database connection failed:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  /**
   * Get a client from the pool
   */
  async getClient(): Promise<PoolClient> {
    return await this.pool.connect();
  }

  /**
   * Execute a query
   */
  async query<T = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }> {
    const operation = this.extractOperation(text);
    const timer = this.metricsService?.databaseQueryMetrics.startTimer({ operation, status: 'success' });
    
    try {
      const result = await this.pool.query(text, params);
      
      timer?.();
      
      return {
        rows: result.rows,
        rowCount: result.rowCount || 0,
      };
    } catch (error) {
      timer?.(); // Stop success timer
      const errorTimer = this.metricsService?.databaseQueryMetrics.startTimer({ operation, status: 'failure' });
      errorTimer?.();
      throw error;
    }
  }
  
  /**
   * Extract operation type from SQL query
   */
  private extractOperation(text: string): string {
    const trimmed = text.trim().toUpperCase();
    if (trimmed.startsWith('SELECT')) return 'select';
    if (trimmed.startsWith('INSERT')) return 'insert';
    if (trimmed.startsWith('UPDATE')) return 'update';
    if (trimmed.startsWith('DELETE')) return 'delete';
    if (trimmed.startsWith('CALL') || trimmed.includes('PROCEDURE')) return 'procedure';
    return 'other';
  }

  /**
   * Execute a transaction
   */
  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute a stored procedure
   */
  async callProcedure<T = any>(
    procedureName: string,
    params?: any[]
  ): Promise<{ rows: T[]; rowCount: number }> {
    const paramPlaceholders = params ? params.map((_, i) => `$${i + 1}`).join(', ') : '';
    const query = `SELECT * FROM ${procedureName}(${paramPlaceholders})`;
    const result = await this.pool.query(query, params);
    return {
      rows: result.rows,
      rowCount: result.rowCount || 0,
    };
  }

  /**
   * Get the pool for advanced usage
   */
  getPool(): Pool {
    return this.pool;
  }
}
