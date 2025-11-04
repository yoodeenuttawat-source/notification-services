import { Test, TestingModule } from '@nestjs/testing';
import { ProviderFactoryService } from './provider-factory.service';
import { CircuitBreakerService } from '../circuit-breaker/CircuitBreakerService';
import { KafkaService } from '../kafka/kafka.service';
import { BaseProviderService } from './base-provider.service';

describe('ProviderFactoryService', () => {
  let service: ProviderFactoryService;
  let circuitBreakerService: CircuitBreakerService;
  let kafkaService: KafkaService;

  beforeEach(async () => {
    const mockCircuitBreakerService = {
      shouldAllowRequest: jest.fn().mockReturnValue(true),
      recordSuccess: jest.fn(),
      recordFailure: jest.fn(),
      getState: jest.fn(),
    };

    const mockKafkaService = {
      publishMessage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProviderFactoryService,
        {
          provide: CircuitBreakerService,
          useValue: mockCircuitBreakerService,
        },
        {
          provide: KafkaService,
          useValue: mockKafkaService,
        },
      ],
    }).compile();

    service = module.get<ProviderFactoryService>(ProviderFactoryService);
    circuitBreakerService = module.get<CircuitBreakerService>(CircuitBreakerService);
    kafkaService = module.get<KafkaService>(KafkaService);
  });

  describe('getProvider', () => {
    it('should return PushProvider1 when requested', () => {
      const provider = service.getProvider('PushProvider1');
      expect(provider).toBeDefined();
      expect(provider?.getName()).toBe('PushProvider1');
      expect(provider?.getChannelType()).toBe('push');
    });

    it('should return PushProvider2 when requested', () => {
      const provider = service.getProvider('PushProvider2');
      expect(provider).toBeDefined();
      expect(provider?.getName()).toBe('PushProvider2');
      expect(provider?.getChannelType()).toBe('push');
    });

    it('should return EmailProvider1 when requested', () => {
      const provider = service.getProvider('EmailProvider1');
      expect(provider).toBeDefined();
      expect(provider?.getName()).toBe('EmailProvider1');
      expect(provider?.getChannelType()).toBe('email');
    });

    it('should return EmailProvider2 when requested', () => {
      const provider = service.getProvider('EmailProvider2');
      expect(provider).toBeDefined();
      expect(provider?.getName()).toBe('EmailProvider2');
      expect(provider?.getChannelType()).toBe('email');
    });

    it('should return undefined for unknown provider', () => {
      const provider = service.getProvider('UnknownProvider');
      expect(provider).toBeUndefined();
    });
  });

  describe('getAllProviders', () => {
    it('should return all providers', () => {
      const providers = service.getAllProviders();
      expect(providers.length).toBe(4);

      const providerNames = providers.map((p) => p.getName());
      expect(providerNames).toContain('PushProvider1');
      expect(providerNames).toContain('PushProvider2');
      expect(providerNames).toContain('EmailProvider1');
      expect(providerNames).toContain('EmailProvider2');
    });

    it('should return instances of BaseProviderService', () => {
      const providers = service.getAllProviders();
      providers.forEach((provider) => {
        expect(provider).toBeInstanceOf(BaseProviderService);
      });
    });
  });
});
