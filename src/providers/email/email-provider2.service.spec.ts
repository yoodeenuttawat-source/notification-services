import { Test, TestingModule } from '@nestjs/testing';
import { EmailProviderService2 } from './email-provider2.service';
import { CircuitBreakerService } from '../../circuit-breaker/CircuitBreakerService';
import { CircuitBreakerOpenError } from '../../circuit-breaker/CircuitBreakerOpenError';
import { KafkaService } from '../../kafka/kafka.service';
import { KAFKA_TOPICS } from '../../kafka/kafka.config';

describe('EmailProviderService2', () => {
  let service: EmailProviderService2;
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
          provide: EmailProviderService2,
          useFactory: (circuitBreaker: CircuitBreakerService, kafka?: KafkaService) => {
            return new EmailProviderService2(circuitBreaker, kafka);
          },
          inject: [CircuitBreakerService, KafkaService],
        },
      ],
    }).compile();

    service = module.get<EmailProviderService2>(EmailProviderService2);
    circuitBreakerService = module.get<CircuitBreakerService>(CircuitBreakerService);
    kafkaService = module.get<KafkaService>(KafkaService);

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
      const url = service['getUrl']();
      expect(url).toBe('https://api.email-provider2.com/v1/send');
    });
  });
});
