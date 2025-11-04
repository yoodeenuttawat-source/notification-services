import { Test, TestingModule } from '@nestjs/testing';
import { PushProviderService1 } from './push-provider1.service';
import { CircuitBreakerService } from '../../circuit-breaker/CircuitBreakerService';
import { CircuitBreakerOpenError } from '../../circuit-breaker/CircuitBreakerOpenError';
import { KafkaService } from '../../kafka/kafka.service';
import { KAFKA_TOPICS } from '../../kafka/kafka.config';

describe('PushProviderService1', () => {
  let service: PushProviderService1;
  let circuitBreakerService: CircuitBreakerService;
  let kafkaService: KafkaService;

  const mockCircuitBreakerService = {
    shouldAllowRequest: jest.fn().mockReturnValue(true),
    recordSuccess: jest.fn(),
    recordFailure: jest.fn(),
    getState: jest.fn(),
  };

  const mockKafkaService = {
    publishMessage: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    // Reset mocks to default state
    mockCircuitBreakerService.shouldAllowRequest.mockReturnValue(true);
    mockCircuitBreakerService.recordSuccess.mockClear();
    mockCircuitBreakerService.recordFailure.mockClear();
    mockKafkaService.publishMessage.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: CircuitBreakerService,
          useValue: mockCircuitBreakerService,
        },
        {
          provide: KafkaService,
          useValue: mockKafkaService,
        },
        {
          provide: PushProviderService1,
          useFactory: (circuitBreaker: CircuitBreakerService, kafka?: KafkaService) => {
            return new PushProviderService1(circuitBreaker, kafka);
          },
          inject: [CircuitBreakerService, KafkaService],
        },
      ],
    }).compile();

    service = module.get<PushProviderService1>(PushProviderService1);
    circuitBreakerService = module.get<CircuitBreakerService>(CircuitBreakerService);
    kafkaService = module.get<KafkaService>(KafkaService);

    jest.clearAllMocks();
  });

  describe('sendNotification', () => {
    it('should send notification successfully', async () => {
      const payload = {
        recipient: 'user123',
        content: 'Test Content',
        context: {
          notification_id: 'test-123',
          event_id: 1,
          event_name: 'TEST',
          channel_id: 1,
          channel_name: 'PUSH',
        },
      };

      const result = await service.sendNotification(payload);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.providerName).toBe('PushProvider1');
      expect(result.provider_request_id).toBe('test-123');
      expect(circuitBreakerService.recordSuccess).toHaveBeenCalledWith(
        'PushProvider1',
        expect.any(Object)
      );
    });

    it('should throw CircuitBreakerOpenError when circuit is open', async () => {
      mockCircuitBreakerService.shouldAllowRequest.mockReturnValue(false);

      const payload = {
        recipient: 'user123',
        content: 'Test Content',
      };

      await expect(service.sendNotification(payload)).rejects.toThrow(CircuitBreakerOpenError);
      expect(circuitBreakerService.recordSuccess).not.toHaveBeenCalled();
    });

    it('should publish provider response on success', async () => {
      const payload = {
        recipient: 'user123',
        content: 'Test Content',
        context: {
          notification_id: 'test-123',
          event_id: 1,
          event_name: 'TEST',
          channel_id: 1,
          channel_name: 'PUSH',
        },
      };

      await service.sendNotification(payload);

      expect(kafkaService.publishMessage).toHaveBeenCalledWith(
        KAFKA_TOPICS.PROVIDER_REQUEST_RESPONSE,
        expect.arrayContaining([
          expect.objectContaining({
            key: 'test-123',
            value: expect.objectContaining({
              provider_request_id: 'test-123',
              notification_id: 'test-123',
              provider_name: 'PushProvider1',
              channel_name: 'PUSH',
            }),
          }),
        ])
      );
    });

    it('should publish delivery log on success', async () => {
      const payload = {
        recipient: 'user123',
        content: 'Test Content',
        context: {
          notification_id: 'test-123',
          event_id: 1,
          event_name: 'TEST',
          channel_id: 1,
          channel_name: 'PUSH',
        },
      };

      await service.sendNotification(payload);

      expect(kafkaService.publishMessage).toHaveBeenCalledWith(
        KAFKA_TOPICS.DELIVERY_LOGS,
        expect.arrayContaining([
          expect.objectContaining({
            key: 'test-123',
            value: expect.objectContaining({
              notification_id: 'test-123',
              stage: 'provider_success',
              status: 'success',
              channel_name: 'PUSH',
            }),
          }),
        ])
      );
    });
  });

  describe('getRequest', () => {
    it('should return correct request structure', () => {
      const payload = {
        recipient: 'user123',
        subject: 'Test Title',
        content: 'Test Content',
        metadata: { source: 'test' },
        context: {
          notification_id: 'test-123',
          event_id: 1,
          event_name: 'TEST',
          channel_id: 1,
          channel_name: 'PUSH',
        },
      };

      const request = service['getRequest'](payload);

      expect(request).toEqual({
        deviceToken: 'user123',
        title: 'Test Title',
        body: 'Test Content',
        metadata: { source: 'test' },
        idempotentKey: 'test-123',
      });
    });

    it('should set title to null when subject is missing', () => {
      const payload = {
        recipient: 'user123',
        content: 'Test Content',
        context: {
          notification_id: 'test-123',
          event_id: 1,
          event_name: 'TEST',
          channel_id: 1,
          channel_name: 'PUSH',
        },
      };

      const request = service['getRequest'](payload);
      expect(request.title).toBeNull();
    });

    it('should use notification_id as idempotentKey', () => {
      const payload = {
        recipient: 'user123',
        content: 'Content',
        context: {
          notification_id: 'custom-id',
          event_id: 1,
          event_name: 'TEST',
          channel_id: 1,
          channel_name: 'PUSH',
        },
      };

      const request = service['getRequest'](payload);
      expect(request.idempotentKey).toBe('custom-id');
    });
  });

  describe('getHeaders', () => {
    it('should return correct headers', () => {
      const payload = {
        recipient: 'user123',
        content: 'Content',
        context: {
          notification_id: 'test-123',
          event_id: 1,
          event_name: 'TEST',
          channel_id: 1,
          channel_name: 'PUSH',
        },
      };

      const headers = service['getHeaders'](payload);

      expect(headers).toEqual({
        'Content-Type': 'application/json',
        Authorization: 'Bearer ',
        'X-Idempotent-Key': 'test-123',
        'X-Provider': 'PushProvider1',
        'X-Provider-Version': '1.0',
      });
    });
  });

  describe('getUrl', () => {
    it('should return default URL', () => {
      const url = service['getUrl']();
      expect(url).toBe('https://api.push-provider1.com/v1/push');
    });
  });

  describe('getName and getChannelType', () => {
    it('should return correct provider name', () => {
      expect(service.getName()).toBe('PushProvider1');
    });

    it('should return correct channel type', () => {
      expect(service.getChannelType()).toBe('push');
    });
  });

  describe('getCircuitBreakerState', () => {
    it('should return circuit breaker state', () => {
      mockCircuitBreakerService.getState.mockReturnValue('CLOSED' as any);

      const state = service.getCircuitBreakerState();

      expect(state).toBe('CLOSED');
      expect(circuitBreakerService.getState).toHaveBeenCalledWith('PushProvider1');
    });
  });

  describe('without KafkaService', () => {
    it('should not publish when kafkaService is not available', async () => {
      const serviceWithoutKafka = new PushProviderService1(circuitBreakerService);

      const payload = {
        recipient: 'user123',
        content: 'Test Content',
        context: {
          notification_id: 'test-123',
          event_id: 1,
          event_name: 'TEST',
          channel_id: 1,
          channel_name: 'PUSH',
        },
      };

      const result = await serviceWithoutKafka.sendNotification(payload);

      expect(result.success).toBe(true);
      expect(kafkaService.publishMessage).not.toHaveBeenCalled();
    });
  });
});
