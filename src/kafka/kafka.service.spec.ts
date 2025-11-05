import { Test, TestingModule } from '@nestjs/testing';
import { KafkaService } from './kafka.service';
import { Kafka, Producer, Consumer } from 'kafkajs';
import { getKafkaConfig } from './kafka.config';

// Mock kafkajs
jest.mock('kafkajs');
jest.mock('./kafka.config');

describe('KafkaService', () => {
  let service: KafkaService;
  let mockProducer: jest.Mocked<Producer>;
  let mockConsumer: jest.Mocked<Consumer>;
  let mockKafka: jest.Mocked<Kafka>;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock producer
    mockProducer = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      send: jest.fn().mockResolvedValue([{ topicName: 'test', partition: 0, errorCode: 0 }]),
    } as any;

    // Mock consumer
    mockConsumer = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Mock Kafka instance
    mockKafka = {
      producer: jest.fn().mockReturnValue(mockProducer),
      consumer: jest.fn().mockReturnValue(mockConsumer),
    } as any;

    (Kafka as jest.MockedClass<typeof Kafka>).mockImplementation(() => mockKafka);
    (getKafkaConfig as jest.Mock).mockReturnValue({
      brokers: ['localhost:29092'],
      clientId: 'test-client',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [KafkaService],
    }).compile();

    service = module.get<KafkaService>(KafkaService);
  });

  describe('onModuleInit', () => {
    it('should connect producer on initialization', async () => {
      await service.onModuleInit();
      expect(mockProducer.connect).toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect producer and consumers', async () => {
      // Create a consumer first
      await service.createConsumer('test-group', ['test-topic']);

      await service.onModuleDestroy();

      expect(mockConsumer.disconnect).toHaveBeenCalled();
      expect(mockProducer.disconnect).toHaveBeenCalled();
    });

    it('should handle no consumers gracefully', async () => {
      await service.onModuleDestroy();
      expect(mockProducer.disconnect).toHaveBeenCalled();
    });
  });

  describe('publishMessage', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should publish message successfully', async () => {
      const messages = [{ key: 'test-key', value: { test: 'data' } }];

      await service.publishMessage('test-topic', messages);

      expect(mockProducer.send).toHaveBeenCalledWith({
        topic: 'test-topic',
        messages: [
          {
            key: 'test-key',
            value: JSON.stringify({ test: 'data' }),
          },
        ],
      });
    });

    it('should publish multiple messages', async () => {
      const messages = [
        { key: 'key1', value: { data: 1 } },
        { key: 'key2', value: { data: 2 } },
      ];

      await service.publishMessage('test-topic', messages);

      expect(mockProducer.send).toHaveBeenCalledWith({
        topic: 'test-topic',
        messages: [
          { key: 'key1', value: JSON.stringify({ data: 1 }) },
          { key: 'key2', value: JSON.stringify({ data: 2 }) },
        ],
      });
    });

    it('should handle messages without keys', async () => {
      const messages = [{ value: { test: 'data' } }];

      await service.publishMessage('test-topic', messages);

      expect(mockProducer.send).toHaveBeenCalledWith({
        topic: 'test-topic',
        messages: [
          {
            key: undefined,
            value: JSON.stringify({ test: 'data' }),
          },
        ],
      });
    });

    it('should throw error when publish fails', async () => {
      const error = new Error('Publish failed');
      mockProducer.send.mockRejectedValue(error);

      const messages = [{ value: { test: 'data' } }];

      await expect(service.publishMessage('test-topic', messages)).rejects.toThrow(
        'Publish failed'
      );
    });
  });

  describe('createConsumer', () => {
    it('should create and connect consumer', async () => {
      const consumer = await service.createConsumer('test-group', ['test-topic']);

      expect(mockKafka.consumer).toHaveBeenCalledWith({
        groupId: 'test-group',
        sessionTimeout: 30000,
        heartbeatInterval: 3000,
      });
      expect(mockConsumer.connect).toHaveBeenCalled();
      expect(mockConsumer.subscribe).toHaveBeenCalledWith({
        topics: ['test-topic'],
        fromBeginning: false,
      });
      expect(consumer).toBe(mockConsumer);
    });

    it('should create consumer with multiple topics', async () => {
      await service.createConsumer('test-group', ['topic1', 'topic2']);

      expect(mockConsumer.subscribe).toHaveBeenCalledWith({
        topics: ['topic1', 'topic2'],
        fromBeginning: false,
      });
    });
  });

  describe('consumeMessages', () => {
    it('should start consuming messages', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);

      await service.consumeMessages(mockConsumer, handler);

      expect(mockConsumer.run).toHaveBeenCalled();
      const runCall = mockConsumer.run.mock.calls[0][0];
      expect(runCall).toHaveProperty('eachMessage');
    });

    it('should handle message processing errors', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('Processing error'));
      const mockPayload = {
        topic: 'test-topic',
        partition: 0,
        message: { key: Buffer.from('key'), value: Buffer.from('value') },
      } as any;

      await service.consumeMessages(mockConsumer, handler);

      const runCall = mockConsumer.run.mock.calls[0][0];

      // Execute the handler to test error handling
      await runCall.eachMessage(mockPayload);

      expect(handler).toHaveBeenCalledWith(mockPayload);
    });

    it('should handle consumeMessages when metricsService timer is undefined', async () => {
      // Create a service without metricsService to test timer?.() branch
      const serviceWithoutMetrics = new KafkaService();
      (serviceWithoutMetrics as any).metricsService = undefined;

      const handler = jest.fn().mockResolvedValue(undefined);
      const mockPayload = {
        topic: 'test-topic',
        partition: 0,
        message: { key: Buffer.from('key'), value: Buffer.from('value') },
      } as any;

      await serviceWithoutMetrics.consumeMessages(mockConsumer, handler, 'test-topic', 'test-group');

      const runCall = mockConsumer.run.mock.calls[0][0];

      // Execute the handler - timer should be undefined, so timer?.() should not throw
      await runCall.eachMessage(mockPayload);

      expect(handler).toHaveBeenCalledWith(mockPayload);
    });
  });

  describe('getProducer', () => {
    it('should return producer instance', () => {
      const producer = service.getProducer();
      expect(producer).toBe(mockProducer);
    });
  });
});
