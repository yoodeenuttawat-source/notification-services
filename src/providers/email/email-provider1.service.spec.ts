import { Test, TestingModule } from '@nestjs/testing';
import { EmailProviderService1 } from './email-provider1.service';
import { CircuitBreakerService } from '../../circuit-breaker/CircuitBreakerService';
import { CircuitBreakerOpenError } from '../../circuit-breaker/CircuitBreakerOpenError';
import { KafkaService } from '../../kafka/kafka.service';
import { KAFKA_TOPICS } from '../../kafka/kafka.config';

describe('EmailProviderService1', () => {
  let service: EmailProviderService1;
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
          provide: EmailProviderService1,
          useFactory: (circuitBreaker: CircuitBreakerService, kafka?: KafkaService) => {
            return new EmailProviderService1(circuitBreaker, kafka);
          },
          inject: [CircuitBreakerService, KafkaService],
        },
      ],
    }).compile();

    service = module.get<EmailProviderService1>(EmailProviderService1);
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
          channel_name: 'EMAIL'
        }
      };

      const result = await service.sendNotification(payload);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.providerName).toBe('EmailProvider1');
      expect(result.provider_request_id).toBe('test-123');
      expect(circuitBreakerService.recordSuccess).toHaveBeenCalledWith('EmailProvider1', expect.any(Object));
    });

    it('should throw CircuitBreakerOpenError when circuit is open', async () => {
      mockCircuitBreakerService.shouldAllowRequest.mockReturnValue(false);

      const payload = {
        recipient: 'test@example.com',
        subject: 'Test Subject',
        content: 'Test Content'
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
          channel_name: 'EMAIL'
        }
      };

      await expect(service.sendNotification(payload)).rejects.toThrow('Email requires subject');
      expect(circuitBreakerService.recordFailure).toHaveBeenCalled();
    });

    it('should publish provider response on success', async () => {
      const payload = {
        recipient: 'test@example.com',
        subject: 'Test Subject',
        content: 'Test Content',
        context: {
          notification_id: 'test-123',
          event_id: 1,
          event_name: 'TEST',
          channel_id: 1,
          channel_name: 'EMAIL'
        }
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
              provider_name: 'EmailProvider1',
              channel_name: 'EMAIL'
            })
          })
        ])
      );
    });

    it('should publish delivery log on success', async () => {
      const payload = {
        recipient: 'test@example.com',
        subject: 'Test Subject',
        content: 'Test Content',
        context: {
          notification_id: 'test-123',
          event_id: 1,
          event_name: 'TEST',
          channel_id: 1,
          channel_name: 'EMAIL'
        }
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
              channel_name: 'EMAIL'
            })
          })
        ])
      );
    });

    it('should publish provider response on failure', async () => {
      const payload = {
        recipient: 'test@example.com',
        content: 'Test Content', // Missing subject
        context: {
          notification_id: 'test-123',
          event_id: 1,
          event_name: 'TEST',
          channel_id: 1,
          channel_name: 'EMAIL'
        }
      };

      await expect(service.sendNotification(payload)).rejects.toThrow();

      // Provider response should be published with error details
      expect(kafkaService.publishMessage).toHaveBeenCalledWith(
        KAFKA_TOPICS.PROVIDER_REQUEST_RESPONSE,
        expect.arrayContaining([
          expect.objectContaining({
            key: 'test-123',
            value: expect.objectContaining({
              provider_name: 'EmailProvider1',
              response: expect.stringContaining('false') // Error response has success: false
            })
          })
        ])
      );
    });

    it('should not publish to Kafka when kafkaService is not available', async () => {
      // Create service without KafkaService
      const serviceWithoutKafka = new EmailProviderService1(circuitBreakerService);

      const payload = {
        recipient: 'test@example.com',
        subject: 'Test Subject',
        content: 'Test Content',
        context: {
          notification_id: 'test-123',
          event_id: 1,
          event_name: 'TEST',
          channel_id: 1,
          channel_name: 'EMAIL'
        }
      };

      const result = await serviceWithoutKafka.sendNotification(payload);

      expect(result.success).toBe(true);
      expect(kafkaService.publishMessage).not.toHaveBeenCalled();
    });

    it('should not publish to Kafka when context is missing', async () => {
      const payload = {
        recipient: 'test@example.com',
        subject: 'Test Subject',
        content: 'Test Content'
        // No context
      };

      const result = await service.sendNotification(payload);

      expect(result.success).toBe(true);
      // Should not publish provider response or delivery log without context
      const providerResponseCalls = (kafkaService.publishMessage as jest.Mock).mock.calls.filter(
        call => call[0] === KAFKA_TOPICS.PROVIDER_REQUEST_RESPONSE
      );
      expect(providerResponseCalls.length).toBe(0);
    });

    it('should not publish provider response when kafkaService is missing in error case', async () => {
      const serviceWithoutKafka = new EmailProviderService1(circuitBreakerService);

      const payload = {
        recipient: 'test@example.com',
        content: 'Test Content', // Missing subject
        context: {
          notification_id: 'test-123',
          event_id: 1,
          event_name: 'TEST',
          channel_id: 1,
          channel_name: 'EMAIL'
        }
      };

      await expect(serviceWithoutKafka.sendNotification(payload)).rejects.toThrow();

      // Should not publish without kafkaService
      expect(kafkaService.publishMessage).not.toHaveBeenCalled();
    });

    it('should not publish delivery log when kafkaService is missing', async () => {
      const serviceWithoutKafka = new EmailProviderService1(circuitBreakerService);

      const payload = {
        recipient: 'test@example.com',
        subject: 'Test Subject',
        content: 'Test Content',
        context: {
          notification_id: 'test-123',
          event_id: 1,
          event_name: 'TEST',
          channel_id: 1,
          channel_name: 'EMAIL'
        }
      };

      const result = await serviceWithoutKafka.sendNotification(payload);

      expect(result.success).toBe(true);
      // Should not publish delivery log without kafkaService
      const deliveryLogCalls = (kafkaService.publishMessage as jest.Mock).mock.calls.filter(
        call => call[0] === KAFKA_TOPICS.DELIVERY_LOGS
      );
      expect(deliveryLogCalls.length).toBe(0);
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
          channel_name: 'EMAIL'
        }
      };

      const request = service['getRequest'](payload);

      expect(request).toEqual({
        recipient: 'test@example.com',
        subject: 'Test Subject',
        content: 'Test Content',
        metadata: { source: 'test' },
        idempotentKey: 'test-123',
        from: 'noreply@example.com',
        to: 'test@example.com'
      });
    });

    it('should use notification_id as idempotentKey', () => {
      const payload = {
        recipient: 'test@example.com',
        subject: 'Test',
        content: 'Content',
        context: {
          notification_id: 'custom-id',
          event_id: 1,
          event_name: 'TEST',
          channel_id: 1,
          channel_name: 'EMAIL'
        }
      };

      const request = service['getRequest'](payload);
      expect(request.idempotentKey).toBe('custom-id');
    });

    it('should use unknown when context is missing', () => {
      const payload = {
        recipient: 'test@example.com',
        subject: 'Test',
        content: 'Content'
      };

      const request = service['getRequest'](payload);
      expect(request.idempotentKey).toBe('unknown');
    });
  });

  describe('getHeaders', () => {
    it('should return correct headers', () => {
      const payload = {
        recipient: 'test@example.com',
        subject: 'Test',
        content: 'Content',
        context: {
          notification_id: 'test-123',
          event_id: 1,
          event_name: 'TEST',
          channel_id: 1,
          channel_name: 'EMAIL'
        }
      };

      const headers = service['getHeaders'](payload);

      expect(headers).toEqual({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ',
        'X-Idempotent-Key': 'test-123',
        'X-Provider': 'EmailProvider1',
        'X-Provider-Version': '1.0'
      });
    });
  });

  describe('getUrl', () => {
    it('should return default URL', () => {
      const url = service['getUrl']();
      expect(url).toBe('https://api.email-provider1.com/v1/send');
    });
  });

  describe('getName and getChannelType', () => {
    it('should return correct provider name', () => {
      expect(service.getName()).toBe('EmailProvider1');
    });

    it('should return correct channel type', () => {
      expect(service.getChannelType()).toBe('email');
    });
  });

  describe('getCircuitBreakerState', () => {
    it('should return circuit breaker state', () => {
      mockCircuitBreakerService.getState.mockReturnValue('OPEN' as any);
      
      const state = service.getCircuitBreakerState();
      
      expect(state).toBe('OPEN');
      expect(circuitBreakerService.getState).toHaveBeenCalledWith('EmailProvider1');
    });
  });
});

