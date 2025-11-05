import { Test, TestingModule } from '@nestjs/testing';
import { BaseWorkerService } from './base-worker.service';
import { KafkaService } from '../kafka/kafka.service';
import { CacheService } from '../cache/cache.service';
import { MetricsService } from '../metrics/metrics.service';
import { KAFKA_TOPICS } from '../kafka/kafka.config';
import { DeliveryLog } from '../kafka/types/delivery-log';
import { DLQMessage } from '../kafka/types/dlq-message';

// Concrete implementation for testing
class TestWorkerService extends BaseWorkerService {
  protected getDedupKeyPrefix(): string {
    return 'dedup:test:';
  }

  protected getDefaultChannelName(): string {
    return 'test-channel';
  }

  protected getDLQTopic(): string {
    return KAFKA_TOPICS.NOTIFICATION_DLQ;
  }

  protected getDLQMetadata(notificationId?: string): Record<string, any> {
    return {
      notification_id: notificationId,
      test_metadata: 'test-value',
    };
  }
}

describe('BaseWorkerService', () => {
  let service: TestWorkerService;
  let kafkaService: KafkaService;
  let cacheService: CacheService;
  let metricsService: MetricsService;

  const mockKafkaService = {
    publishMessage: jest.fn().mockResolvedValue(undefined),
  };

  const mockCacheService = {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue(undefined),
  };

  const mockMetricsService = {
    workerProcessingMetrics: {
      observe: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: KafkaService,
          useValue: mockKafkaService,
        },
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
        {
          provide: TestWorkerService,
          useFactory: (
            kafka: KafkaService,
            cache: CacheService,
            metrics: MetricsService
          ) => {
            return new TestWorkerService(kafka, cache, 'TestWorker', metrics);
          },
          inject: [KafkaService, CacheService, MetricsService],
        },
      ],
    }).compile();

    service = module.get<TestWorkerService>(TestWorkerService);
    kafkaService = module.get<KafkaService>(KafkaService);
    cacheService = module.get<CacheService>(CacheService);
    metricsService = module.get<MetricsService>(MetricsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('parseMessage', () => {
    it('should parse valid JSON message', async () => {
      const message = { notification_id: 'test-123', data: 'test' };
      const result = await (service as any).parseMessage(JSON.stringify(message));

      expect(result).toEqual(message);
    });

    it('should return null for invalid JSON', async () => {
      const publishSpy = jest.spyOn(service as any, 'publishDeliveryLog');
      const result = await (service as any).parseMessage('invalid json');

      expect(result).toBeNull();
      expect(publishSpy).toHaveBeenCalled();
      const logCall = publishSpy.mock.calls[0][0] as any;
      expect(logCall.notification_id).toBe('unknown');
      expect(logCall.error_message).toContain('Invalid JSON message format');
    });
  });

  describe('publishDeliveryLog', () => {
    it('should publish delivery log to Kafka', async () => {
      const log: Omit<DeliveryLog, 'timestamp'> = {
        notification_id: 'test-123',
        event_id: 1,
        event_name: 'TEST_EVENT',
        channel_id: 1,
        channel_name: 'test',
        stage: 'routed',
        status: 'pending',
      };

      await (service as any).publishDeliveryLog(log);

      expect(kafkaService.publishMessage).toHaveBeenCalledWith(
        KAFKA_TOPICS.DELIVERY_LOGS,
        expect.arrayContaining([
          expect.objectContaining({
            key: 'test-123',
            value: expect.objectContaining({
              ...log,
              timestamp: expect.any(String),
            }),
          }),
        ])
      );
    });
  });

  describe('sendToDLQ', () => {
    it('should send message to DLQ', async () => {
      const originalMessage = JSON.stringify({ notification_id: 'test-123' });
      const error = new Error('Test error');

      await (service as any).sendToDLQ(originalMessage, 'test-topic', 'test-key', error, 'test-123');

      expect(kafkaService.publishMessage).toHaveBeenCalledWith(
        KAFKA_TOPICS.NOTIFICATION_DLQ,
        expect.arrayContaining([
          expect.objectContaining({
            key: 'test-123',
            value: expect.objectContaining({
              originalMessage: { notification_id: 'test-123' },
              originalTopic: 'test-topic',
              originalKey: 'test-key',
              error: expect.objectContaining({
                message: 'Test error',
                type: 'Error',
              }),
              metadata: {
                notification_id: 'test-123',
                test_metadata: 'test-value',
              },
            }),
          }),
        ])
      );
    });

    it('should handle DLQ send failure gracefully', async () => {
      const loggerErrorSpy = jest.spyOn(service['logger'], 'error').mockImplementation();
      mockKafkaService.publishMessage.mockRejectedValueOnce(new Error('DLQ error'));

      const originalMessage = JSON.stringify({ notification_id: 'test-123' });
      const error = new Error('Test error');

      await expect(
        (service as any).sendToDLQ(originalMessage, 'test-topic', 'test-key', error, 'test-123')
      ).resolves.not.toThrow();

      expect(loggerErrorSpy).toHaveBeenCalled();
      loggerErrorSpy.mockRestore();
    });

    it('should use notificationId as key if provided', async () => {
      const originalMessage = JSON.stringify({ notification_id: 'test-123' });
      const error = new Error('Test error');

      await (service as any).sendToDLQ(originalMessage, 'test-topic', undefined, error, 'test-123');

      expect(kafkaService.publishMessage).toHaveBeenCalledWith(
        KAFKA_TOPICS.NOTIFICATION_DLQ,
        expect.arrayContaining([
          expect.objectContaining({
            key: 'test-123',
          }),
        ])
      );
    });

    it('should use originalKey if notificationId not provided', async () => {
      const originalMessage = JSON.stringify({});
      const error = new Error('Test error');

      await (service as any).sendToDLQ(originalMessage, 'test-topic', 'original-key', error);

      expect(kafkaService.publishMessage).toHaveBeenCalledWith(
        KAFKA_TOPICS.NOTIFICATION_DLQ,
        expect.arrayContaining([
          expect.objectContaining({
            key: 'original-key',
          }),
        ])
      );
    });
  });

  describe('handleProcessingError', () => {
    it('should send error to DLQ', async () => {
      const sendToDLQSpy = jest.spyOn(service as any, 'sendToDLQ').mockResolvedValue(undefined);
      const originalMessage = JSON.stringify({ notification_id: 'test-123' });
      const error = new Error('Processing error');

      await (service as any).handleProcessingError(originalMessage, 'test-key', error, 'test-topic');

      expect(sendToDLQSpy).toHaveBeenCalledWith(
        originalMessage,
        'test-topic',
        'test-key',
        error,
        'test-123'
      );
    });

    it('should extract notification_id from message', async () => {
      const sendToDLQSpy = jest.spyOn(service as any, 'sendToDLQ').mockResolvedValue(undefined);
      const originalMessage = JSON.stringify({ notification_id: 'extracted-id' });
      const error = new Error('Processing error');

      await (service as any).handleProcessingError(originalMessage, undefined, error);

      expect(sendToDLQSpy).toHaveBeenCalledWith(
        originalMessage,
        expect.any(String),
        undefined,
        error,
        'extracted-id'
      );
    });

    it('should handle parse errors when extracting notification_id', async () => {
      const sendToDLQSpy = jest.spyOn(service as any, 'sendToDLQ').mockResolvedValue(undefined);
      const originalMessage = 'invalid json';
      const error = new Error('Processing error');

      await (service as any).handleProcessingError(originalMessage, undefined, error);

      expect(sendToDLQSpy).toHaveBeenCalledWith(
        originalMessage,
        expect.any(String),
        undefined,
        error,
        undefined
      );
    });
  });

  describe('isDuplicate', () => {
    it('should return true if notification is cached', async () => {
      mockCacheService.get.mockResolvedValue(true);

      const result = await (service as any).isDuplicate('test-123');

      expect(result).toBe(true);
      expect(cacheService.get).toHaveBeenCalledWith('dedup:test:test-123');
    });

    it('should return false if notification is not cached', async () => {
      mockCacheService.get.mockResolvedValue(null);

      const result = await (service as any).isDuplicate('test-123');

      expect(result).toBe(false);
    });
  });

  describe('markAsProcessed', () => {
    it('should mark notification as processed in cache', async () => {
      await (service as any).markAsProcessed('test-123');

      expect(cacheService.set).toHaveBeenCalledWith('dedup:test:test-123', true, 120);
    });
  });

  describe('extractNotificationId', () => {
    it('should extract notification_id from valid JSON', () => {
      const message = JSON.stringify({ notification_id: 'test-123' });
      const result = (service as any).extractNotificationId(message);

      expect(result).toBe('test-123');
    });

    it('should return undefined for invalid JSON', () => {
      const result = (service as any).extractNotificationId('invalid json');

      expect(result).toBeUndefined();
    });

    it('should return undefined if notification_id is missing', () => {
      const message = JSON.stringify({ other_field: 'value' });
      const result = (service as any).extractNotificationId(message);

      expect(result).toBeUndefined();
    });
  });
});

