import { Test, TestingModule } from '@nestjs/testing';
import { PushProviderService2 } from './push-provider2.service';
import { CircuitBreakerService } from '../../circuit-breaker/CircuitBreakerService';
import { CircuitBreakerOpenError } from '../../circuit-breaker/CircuitBreakerOpenError';
import { KafkaService } from '../../kafka/kafka.service';

describe('PushProviderService2', () => {
  let service: PushProviderService2;
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
          provide: PushProviderService2,
          useFactory: (circuitBreaker: CircuitBreakerService, kafka?: KafkaService) => {
            return new PushProviderService2(circuitBreaker, kafka);
          },
          inject: [CircuitBreakerService, KafkaService],
        },
      ],
    }).compile();

    service = module.get<PushProviderService2>(PushProviderService2);
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
          channel_name: 'PUSH'
        }
      };

      const result = await service.sendNotification(payload);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.providerName).toBe('PushProvider2');
      expect(result.provider_request_id).toBe('test-123');
      expect(circuitBreakerService.recordSuccess).toHaveBeenCalledWith('PushProvider2', expect.any(Object));
    });

    it('should throw CircuitBreakerOpenError when circuit is open', async () => {
      mockCircuitBreakerService.shouldAllowRequest.mockReturnValue(false);

      const payload = {
        recipient: 'user123',
        content: 'Test Content'
      };

      await expect(service.sendNotification(payload)).rejects.toThrow(CircuitBreakerOpenError);
      expect(circuitBreakerService.recordSuccess).not.toHaveBeenCalled();
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

  describe('without KafkaService', () => {
    it('should not publish when kafkaService is not available', async () => {
      const serviceWithoutKafka = new PushProviderService2(circuitBreakerService);

      const payload = {
        recipient: 'user123',
        content: 'Test Content',
        context: {
          notification_id: 'test-123',
          event_id: 1,
          event_name: 'TEST',
          channel_id: 1,
          channel_name: 'PUSH'
        }
      };

      const result = await serviceWithoutKafka.sendNotification(payload);

      expect(result.success).toBe(true);
      expect(kafkaService.publishMessage).not.toHaveBeenCalled();
    });
  });
});

