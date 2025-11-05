import { Test, TestingModule } from '@nestjs/testing';
import { EmailProviderService2 } from './email-provider2.service';
import { CircuitBreakerService } from '../../circuit-breaker/CircuitBreakerService';
import { CircuitBreakerOpenError } from '../../circuit-breaker/CircuitBreakerOpenError';
import { KafkaService } from '../../kafka/kafka.service';
import { MetricsService } from '../../metrics/metrics.service';
import { KAFKA_TOPICS } from '../../kafka/kafka.config';

describe('EmailProviderService2', () => {
  let service: EmailProviderService2;
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
          provide: EmailProviderService2,
          useFactory: (
            circuitBreaker: CircuitBreakerService,
            kafka: KafkaService,
            metrics: MetricsService
          ) => {
            return new EmailProviderService2(circuitBreaker, kafka, {}, metrics);
          },
          inject: [CircuitBreakerService, KafkaService, MetricsService],
        },
      ],
    }).compile();

    service = module.get<EmailProviderService2>(EmailProviderService2);
    circuitBreakerService = module.get<CircuitBreakerService>(CircuitBreakerService);
    kafkaService = module.get<KafkaService>(KafkaService);
    metricsService = module.get<MetricsService>(MetricsService);

    jest.clearAllMocks();
  });

  describe('sendNotification', () => {
    it('should send notification successfully', async () => {
      const payload = {
        recipient: 'test@example.com',
        subject: 'Test Subject',
        content: 'Test Content',
        context: {
          notification_id: 'test-123',
          event_id: 1,
          event_name: 'TEST',
          channel_id: 1,
          channel_name: 'EMAIL',
        },
      };

      const result = await service.sendNotification(payload);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.providerName).toBe('EmailProvider2');
      expect(result.provider_request_id).toBe('test-123');
      expect(circuitBreakerService.recordSuccess).toHaveBeenCalledWith(
        'EmailProvider2',
        expect.any(Object)
      );
    });

    it('should throw CircuitBreakerOpenError when circuit is open', async () => {
      mockCircuitBreakerService.shouldAllowRequest.mockReturnValue(false);

      const payload = {
        recipient: 'test@example.com',
        subject: 'Test Subject',
        content: 'Test Content',
      };

      await expect(service.sendNotification(payload)).rejects.toThrow(CircuitBreakerOpenError);
      expect(circuitBreakerService.recordSuccess).not.toHaveBeenCalled();
    });

    it('should throw error when subject is missing', async () => {
      const payload = {
        recipient: 'test@example.com',
        content: 'Test Content',
        context: {
          notification_id: 'test-123',
          event_id: 1,
          event_name: 'TEST',
          channel_id: 1,
          channel_name: 'EMAIL',
        },
      };

      await expect(service.sendNotification(payload)).rejects.toThrow('Email requires subject');
      expect(circuitBreakerService.recordFailure).toHaveBeenCalled();
    });

    it('should use "unknown" as idempotentKey when context is missing', async () => {
      const payload = {
        recipient: 'test@example.com',
        subject: 'Test Subject',
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

  describe('getRequest', () => {
    it('should return correct request structure', () => {
      const payload = {
        recipient: 'test@example.com',
        subject: 'Test Subject',
        content: 'Test Content',
        metadata: { source: 'test' },
        context: {
          notification_id: 'test-123',
          event_id: 1,
          event_name: 'TEST',
          channel_id: 1,
          channel_name: 'EMAIL',
        },
      };

      const request = service['getRequest'](payload);

      expect(request).toEqual({
        recipient: 'test@example.com',
        subject: 'Test Subject',
        content: 'Test Content',
        metadata: { source: 'test' },
        idempotentKey: 'test-123',
        from: 'noreply@example.com',
        to: 'test@example.com',
      });
    });

    it('should use "unknown" as idempotentKey when context is missing', () => {
      const payload = {
        recipient: 'test@example.com',
        subject: 'Test Subject',
        content: 'Test Content',
      };

      const request = service['getRequest'](payload);
      expect(request.idempotentKey).toBe('unknown');
    });

    it('should use EMAIL_FROM env var when set', () => {
      process.env.EMAIL_FROM = 'custom@example.com';
      const payload = {
        recipient: 'test@example.com',
        subject: 'Test Subject',
        content: 'Test Content',
      };

      const request = service['getRequest'](payload);
      expect(request.from).toBe('custom@example.com');
      delete process.env.EMAIL_FROM;
    });

    it('should use default EMAIL_FROM when env var is not set', () => {
      delete process.env.EMAIL_FROM;
      const payload = {
        recipient: 'test@example.com',
        subject: 'Test Subject',
        content: 'Test Content',
      };

      const request = service['getRequest'](payload);
      expect(request.from).toBe('noreply@example.com');
    });
  });

  describe('getHeaders', () => {
    it('should return correct headers', () => {
      const payload = {
        recipient: 'test@example.com',
        subject: 'Test Subject',
        content: 'Test Content',
        context: {
          notification_id: 'test-123',
          event_id: 1,
          event_name: 'TEST',
          channel_id: 1,
          channel_name: 'EMAIL',
        },
      };

      const headers = service['getHeaders'](payload);

      expect(headers).toEqual({
        'Content-Type': 'application/json',
        Authorization: 'Bearer ',
        'X-Idempotent-Key': 'test-123',
        'X-Provider': 'EmailProvider2',
        'X-Provider-Version': '1.0',
      });
    });

    it('should use "unknown" as idempotentKey when context is missing', () => {
      const payload = {
        recipient: 'test@example.com',
        subject: 'Test Subject',
        content: 'Test Content',
      };

      const headers = service['getHeaders'](payload);
      expect(headers['X-Idempotent-Key']).toBe('unknown');
    });
  });

  describe('getName and getChannelType', () => {
    it('should return correct provider name', () => {
      expect(service.getName()).toBe('EmailProvider2');
    });

    it('should return correct channel type', () => {
      expect(service.getChannelType()).toBe('email');
    });
  });

  describe('getUrl', () => {
    it('should return default URL', () => {
      delete process.env.EMAIL_PROVIDER2_API_URL;
      delete process.env.PROVIDER_API_URL;
      const url = service['getUrl']();
      expect(url).toBe('https://api.email-provider2.com/v1/send');
    });

    it('should return EMAIL_PROVIDER2_API_URL when set', () => {
      process.env.EMAIL_PROVIDER2_API_URL = 'https://custom-email-provider2.com/api';
      delete process.env.PROVIDER_API_URL;
      const url = service['getUrl']();
      expect(url).toBe('https://custom-email-provider2.com/api');
      delete process.env.EMAIL_PROVIDER2_API_URL;
    });

    it('should return PROVIDER_API_URL when EMAIL_PROVIDER2_API_URL is not set', () => {
      delete process.env.EMAIL_PROVIDER2_API_URL;
      process.env.PROVIDER_API_URL = 'https://generic-provider.com/api';
      const url = service['getUrl']();
      expect(url).toBe('https://generic-provider.com/api');
      delete process.env.PROVIDER_API_URL;
    });
  });
});
