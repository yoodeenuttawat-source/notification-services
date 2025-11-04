import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from './database.service';
import { Pool, PoolClient } from 'pg';

describe('DatabaseService', () => {
  let service: DatabaseService;
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [DatabaseService],
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

      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM test_procedure($1, $2)', [1, 'test']);
      expect(result).toEqual({ rows: mockResult.rows, rowCount: mockResult.rowCount });
    });

    it('should handle database errors', async () => {
      const error = new Error('Database connection failed');
      mockPool.query.mockRejectedValue(error);

      await expect(service.callProcedure('test_procedure')).rejects.toThrow('Database connection failed');
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
});

