import { Injectable } from '@nestjs/common';
import { CircuitBreakerService } from '../circuit-breaker/CircuitBreakerService';
import { KafkaService } from '../kafka/kafka.service';
import { BaseProviderService } from './base-provider.service';
import { PushProviderService1 } from './push/push-provider1.service';
import { PushProviderService2 } from './push/push-provider2.service';
import { EmailProviderService1 } from './email/email-provider1.service';
import { EmailProviderService2 } from './email/email-provider2.service';

@Injectable()
export class ProviderFactoryService {
  private providers: Map<string, BaseProviderService> = new Map();

  constructor(
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly kafkaService?: KafkaService
  ) {
    // Initialize all providers with KafkaService
    this.providers.set(
      'PushProvider1',
      new PushProviderService1(this.circuitBreakerService, this.kafkaService)
    );
    this.providers.set(
      'PushProvider2',
      new PushProviderService2(this.circuitBreakerService, this.kafkaService)
    );
    this.providers.set(
      'EmailProvider1',
      new EmailProviderService1(this.circuitBreakerService, this.kafkaService)
    );
    this.providers.set(
      'EmailProvider2',
      new EmailProviderService2(this.circuitBreakerService, this.kafkaService)
    );
  }

  getProvider(name: string): BaseProviderService | undefined {
    return this.providers.get(name);
  }

  getAllProviders(): BaseProviderService[] {
    return Array.from(this.providers.values());
  }
}
