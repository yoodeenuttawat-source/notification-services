import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from './database.service';
import { Pool, PoolClient } from 'pg';
import { MetricsService } from '../metrics/metrics.service';

describe('DatabaseService', () => {
  let service: DatabaseService;
  let mockMetricsService: jest.Mocked<MetricsService>;
  let mockPool: {
    query: jest.Mock;
    connect: jest.Mock;
    end: jest.Mock;
    on: jest.Mock;
    once: jest.Mock;
    removeListener: jest.Mock;
    removeAllListeners: jest.Mock;
    emit: jest.Mock;
    off: jest.Mock;
    addListener: jest.Mock;
    setMaxListeners: jest.Mock;
    getMaxListeners: jest.Mock;
    listeners: jest.Mock;
    rawListeners: jest.Mock;
    listenerCount: jest.Mock;
    prependListener: jest.Mock;
    prependOnceListener: jest.Mock;
  };

  beforeEach(async () => {
    mockPool = {
      query: jest.fn(),
      connect: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      removeListener: jest.fn(),
      removeAllListeners: jest.fn(),
      emit: jest.fn(),
      off: jest.fn(),
      addListener: jest.fn(),
      setMaxListeners: jest.fn(),
      getMaxListeners: jest.fn(),
      listeners: jest.fn(),
      rawListeners: jest.fn(),
      listenerCount: jest.fn(),
      prependListener: jest.fn(),
      prependOnceListener: jest.fn(),
    };

    mockMetricsService = {
      databaseQueryMetrics: {
        startTimer: jest.fn().mockReturnValue(jest.fn()),
      },
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseService,
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
      ],
    }).compile();

    service = module.get<DatabaseService>(DatabaseService);
    // Replace the internal pool with our mock
    (service as any).pool = mockPool;
  });

  describe('callProcedure', () => {
    it('should call stored procedure successfully', async () => {
      const mockResult = {
        rows: [{ id: 1, name: 'test' }],
        rowCount: 1,
        command: 'SELECT',
      };

      mockPool.query.mockResolvedValue(mockResult as any);

      const result = await service.callProcedure('test_procedure');

      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM test_procedure()', undefined);
      expect(result).toEqual({ rows: mockResult.rows, rowCount: mockResult.rowCount });
    });

    it('should handle procedure call with parameters', async () => {
      const mockResult = {
        rows: [{ id: 1 }],
        rowCount: 1,
        command: 'SELECT',
      };

      mockPool.query.mockResolvedValue(mockResult as any);

      const result = await service.callProcedure('test_procedure', [1, 'test']);

      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM test_procedure($1, $2)', [
        1,
        'test',
      ]);
      expect(result).toEqual({ rows: mockResult.rows, rowCount: mockResult.rowCount });
    });

    it('should handle database errors', async () => {
      const error = new Error('Database connection failed');
      mockPool.query.mockRejectedValue(error);

      await expect(service.callProcedure('test_procedure')).rejects.toThrow(
        'Database connection failed'
      );
    });

    it('should handle empty results', async () => {
      const mockResult = {
        rows: [],
        rowCount: 0,
        command: 'SELECT',
      };

      mockPool.query.mockResolvedValue(mockResult as any);

      const result = await service.callProcedure('test_procedure');

      expect(result.rows).toEqual([]);
      expect(result.rowCount).toBe(0);
    });
  });

  describe('query', () => {
    it('should execute query successfully', async () => {
      const mockResult = {
        rows: [{ id: 1, name: 'test' }],
        rowCount: 1,
      };

      mockPool.query.mockResolvedValue(mockResult as any);

      const result = await service.query('SELECT * FROM test');

      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM test', undefined);
      expect(result).toEqual({ rows: mockResult.rows, rowCount: mockResult.rowCount });
    });

    it('should handle query with parameters', async () => {
      const mockResult = {
        rows: [{ id: 1 }],
        rowCount: 1,
      };

      mockPool.query.mockResolvedValue(mockResult as any);

      const result = await service.query('SELECT * FROM test WHERE id = $1', [1]);

      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM test WHERE id = $1', [1]);
      expect(result).toEqual({ rows: mockResult.rows, rowCount: mockResult.rowCount });
    });

    it('should handle null rowCount', async () => {
      const mockResult = {
        rows: [{ id: 1 }],
        rowCount: null,
      };

      mockPool.query.mockResolvedValue(mockResult as any);

      const result = await service.query('SELECT * FROM test');

      expect(result.rowCount).toBe(0);
    });
  });

  describe('transaction', () => {
    it('should execute transaction successfully', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      } as any;

      mockPool.connect.mockResolvedValue(mockClient);
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Transaction query
        .mockResolvedValueOnce({}); // COMMIT

      const callback = jest.fn().mockResolvedValue({ id: 1 });

      const result = await service.transaction(callback);

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(callback).toHaveBeenCalledWith(mockClient);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toEqual({ id: 1 });
    });

    it('should rollback on error', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      } as any;

      mockPool.connect.mockResolvedValue(mockClient);
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Transaction failed')); // Error in callback

      const callback = jest.fn().mockRejectedValue(new Error('Transaction failed'));

      await expect(service.transaction(callback)).rejects.toThrow('Transaction failed');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('getClient', () => {
    it('should get client from pool', async () => {
      const mockClient = {} as PoolClient;
      mockPool.connect.mockResolvedValue(mockClient);

      const client = await service.getClient();

      expect(mockPool.connect).toHaveBeenCalled();
      expect(client).toBe(mockClient);
    });
  });

  describe('getPool', () => {
    it('should return the pool', () => {
      const pool = service.getPool();
      expect(pool).toBe(mockPool);
    });
  });

  describe('onModuleInit', () => {
    it('should test connection successfully', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await service.onModuleInit();

      expect(mockPool.query).toHaveBeenCalledWith('SELECT NOW()');
      consoleLogSpy.mockRestore();
    });

    it('should throw error on connection failure', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const error = new Error('Database connection failed');
      mockPool.query.mockRejectedValue(error);

      await expect(service.onModuleInit()).rejects.toThrow('Database connection failed');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Database connection failed:', error);
      consoleErrorSpy.mockRestore();
    });
  });

  describe('onModuleDestroy', () => {
    it('should end the pool', async () => {
      await service.onModuleDestroy();
      expect(mockPool.end).toHaveBeenCalled();
    });
  });

  describe('query error handling', () => {
    it('should record failure metrics on query error', async () => {
      const error = new Error('Query failed');
      mockPool.query.mockRejectedValue(error);

      const mockTimer = jest.fn();
      (mockMetricsService.databaseQueryMetrics.startTimer as jest.Mock).mockReturnValue(mockTimer);

      await expect(service.query('SELECT * FROM test')).rejects.toThrow('Query failed');

      expect(mockMetricsService.databaseQueryMetrics.startTimer).toHaveBeenCalledWith({
        operation: 'select',
      });
      expect(mockTimer).toHaveBeenCalledWith({ status: 'failed' });
    });
  });

  describe('extractOperation', () => {
    it('should extract SELECT operation', async () => {
      const mockResult = { rows: [], rowCount: 0 };
      mockPool.query.mockResolvedValue(mockResult as any);
      const mockTimer = jest.fn();
      (mockMetricsService.databaseQueryMetrics.startTimer as jest.Mock).mockReturnValue(mockTimer);

      await service.query('SELECT * FROM test');

      expect(mockMetricsService.databaseQueryMetrics.startTimer).toHaveBeenCalledWith({
        operation: 'select',
      });
      expect(mockTimer).toHaveBeenCalledWith({ status: 'success' });
    });

    it('should extract INSERT operation', async () => {
      const mockResult = { rows: [], rowCount: 0 };
      mockPool.query.mockResolvedValue(mockResult as any);
      const mockTimer = jest.fn();
      (mockMetricsService.databaseQueryMetrics.startTimer as jest.Mock).mockReturnValue(mockTimer);

      await service.query('INSERT INTO test VALUES (1)');

      expect(mockMetricsService.databaseQueryMetrics.startTimer).toHaveBeenCalledWith({
        operation: 'insert',
      });
      expect(mockTimer).toHaveBeenCalledWith({ status: 'success' });
    });

    it('should extract UPDATE operation', async () => {
      const mockResult = { rows: [], rowCount: 0 };
      mockPool.query.mockResolvedValue(mockResult as any);
      const mockTimer = jest.fn();
      (mockMetricsService.databaseQueryMetrics.startTimer as jest.Mock).mockReturnValue(mockTimer);

      await service.query('UPDATE test SET name = $1 WHERE id = $2');

      expect(mockMetricsService.databaseQueryMetrics.startTimer).toHaveBeenCalledWith({
        operation: 'update',
      });
      expect(mockTimer).toHaveBeenCalledWith({ status: 'success' });
    });

    it('should extract DELETE operation', async () => {
      const mockResult = { rows: [], rowCount: 0 };
      mockPool.query.mockResolvedValue(mockResult as any);
      const mockTimer = jest.fn();
      (mockMetricsService.databaseQueryMetrics.startTimer as jest.Mock).mockReturnValue(mockTimer);

      await service.query('DELETE FROM test WHERE id = $1');

      expect(mockMetricsService.databaseQueryMetrics.startTimer).toHaveBeenCalledWith({
        operation: 'delete',
      });
      expect(mockTimer).toHaveBeenCalledWith({ status: 'success' });
    });

    it('should extract PROCEDURE operation', async () => {
      const mockResult = { rows: [], rowCount: 0 };
      mockPool.query.mockResolvedValue(mockResult as any);
      const mockTimer = jest.fn();
      (mockMetricsService.databaseQueryMetrics.startTimer as jest.Mock).mockReturnValue(mockTimer);

      await service.query('CALL test_procedure($1)');

      expect(mockMetricsService.databaseQueryMetrics.startTimer).toHaveBeenCalledWith({
        operation: 'procedure',
      });
      expect(mockTimer).toHaveBeenCalledWith({ status: 'success' });
    });

    it('should extract other operation for unknown queries', async () => {
      const mockResult = { rows: [], rowCount: 0 };
      mockPool.query.mockResolvedValue(mockResult as any);
      const mockTimer = jest.fn();
      (mockMetricsService.databaseQueryMetrics.startTimer as jest.Mock).mockReturnValue(mockTimer);

      await service.query('ALTER TABLE test ADD COLUMN name VARCHAR');

      expect(mockMetricsService.databaseQueryMetrics.startTimer).toHaveBeenCalledWith({
        operation: 'other',
      });
      expect(mockTimer).toHaveBeenCalledWith({ status: 'success' });
    });
  });

  describe('transaction rollback error handling', () => {
    it('should handle rollback error gracefully', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      } as any;

      mockPool.connect.mockResolvedValue(mockClient);
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Transaction failed')); // Error in callback

      const callback = jest.fn().mockRejectedValue(new Error('Transaction failed'));
      mockClient.query.mockRejectedValueOnce(new Error('Rollback failed')); // Rollback also fails

      await expect(service.transaction(callback)).rejects.toThrow('Transaction failed');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled(); // Should still release client
    });
  });
});
