import { Test, TestingModule } from '@nestjs/testing';
import { PushProviderService2 } from './push-provider2.service';
import { CircuitBreakerService } from '../../circuit-breaker/CircuitBreakerService';
import { CircuitBreakerOpenError } from '../../circuit-breaker/CircuitBreakerOpenError';
import { KafkaService } from '../../kafka/kafka.service';
import { MetricsService } from '../../metrics/metrics.service';

describe('PushProviderService2', () => {
  let service: PushProviderService2;
  let circuitBreakerService: CircuitBreakerService;
  let kafkaService: KafkaService;
  let metricsService: MetricsService;

  const mockCircuitBreakerService = {
    shouldAllowRequest: jest.fn().mockReturnValue(true),
    recordSuccess: jest.fn(),
    recordFailure: jest.fn(),
    getState: jest.fn(),
  };

  const mockKafkaService = {
    publishMessage: jest.fn().mockResolvedValue(undefined),
  };

  const mockMetricsService = {
    providerApiMetrics: {
      startTimer: jest.fn().mockReturnValue(() => 0.1),
    },
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
          provide: MetricsService,
          useValue: mockMetricsService,
        },
        {
          provide: PushProviderService2,
          useFactory: (
            circuitBreaker: CircuitBreakerService,
            kafka: KafkaService,
            metrics: MetricsService
          ) => {
            return new PushProviderService2(circuitBreaker, kafka, {}, metrics);
          },
          inject: [CircuitBreakerService, KafkaService, MetricsService],
        },
      ],
    }).compile();

    service = module.get<PushProviderService2>(PushProviderService2);
    circuitBreakerService = module.get<CircuitBreakerService>(CircuitBreakerService);
    kafkaService = module.get<KafkaService>(KafkaService);
    metricsService = module.get<MetricsService>(MetricsService);

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
      expect(result.providerName).toBe('PushProvider2');
      expect(result.provider_request_id).toBe('test-123');
      expect(circuitBreakerService.recordSuccess).toHaveBeenCalledWith(
        'PushProvider2',
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
        target: 'user123',
        notification: {
          title: 'Test Title',
          message: 'Test Content',
        },
        metadata: { source: 'test' },
        idempotentKey: 'test-123',
      });
    });

    it('should use "unknown" as idempotentKey when context is missing', () => {
      const payload = {
        recipient: 'user123',
        content: 'Content',
      };

      const request = service['getRequest'](payload);
      expect(request.idempotentKey).toBe('unknown');
    });

    it('should set title to null when subject is missing', () => {
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

      const request = service['getRequest'](payload);
      expect(request.notification.title).toBeNull();
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
        'X-Provider': 'PushProvider2',
        'X-Provider-Version': '2.0',
      });
    });

    it('should use "unknown" as idempotentKey when context is missing', () => {
      const payload = {
        recipient: 'user123',
        content: 'Content',
      };

      const headers = service['getHeaders'](payload);
      expect(headers['X-Idempotent-Key']).toBe('unknown');
    });
  });

  describe('getUrl', () => {
    it('should return default URL', () => {
      delete process.env.PUSH_PROVIDER2_API_URL;
      delete process.env.PROVIDER_API_URL;
      const url = service['getUrl']();
      expect(url).toBe('https://api.push-provider2.com/v1/notifications');
    });

    it('should return PUSH_PROVIDER2_API_URL when set', () => {
      process.env.PUSH_PROVIDER2_API_URL = 'https://custom-push-provider2.com/api';
      delete process.env.PROVIDER_API_URL;
      const url = service['getUrl']();
      expect(url).toBe('https://custom-push-provider2.com/api');
      delete process.env.PUSH_PROVIDER2_API_URL;
    });

    it('should return PROVIDER_API_URL when PUSH_PROVIDER2_API_URL is not set', () => {
      delete process.env.PUSH_PROVIDER2_API_URL;
      process.env.PROVIDER_API_URL = 'https://generic-provider.com/api';
      const url = service['getUrl']();
      expect(url).toBe('https://generic-provider.com/api');
      delete process.env.PROVIDER_API_URL;
    });
  });

  describe('executeSend', () => {
    it('should use "unknown" as idempotentKey when context is missing', async () => {
      const payload = {
        recipient: 'user123',
        content: 'Test Content',
      };

      const loggerSpy = jest.spyOn(service['logger'], 'log');
      await service.sendNotification(payload);

      expect(loggerSpy).toHaveBeenCalled();
      const logCall = loggerSpy.mock.calls[0][0];
      const logData = JSON.parse(logCall);
      expect(logData.idempotentKey).toBe('unknown');
    });
  });

  describe('getName and getChannelType', () => {
    it('should return correct provider name', () => {
      expect(service.getName()).toBe('PushProvider2');
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
      expect(circuitBreakerService.getState).toHaveBeenCalledWith('PushProvider2');
    });
  });

});
