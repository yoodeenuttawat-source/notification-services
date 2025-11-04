import { CircuitBreakerService } from '../circuit-breaker/CircuitBreakerService';
import { KafkaService } from '../kafka/kafka.service';
import { BaseProviderService } from './base-provider.service';
export declare class ProviderFactoryService {
    private readonly circuitBreakerService;
    private readonly kafkaService?;
    private providers;
    constructor(circuitBreakerService: CircuitBreakerService, kafkaService?: KafkaService);
    getProvider(name: string): BaseProviderService | undefined;
    getAllProviders(): BaseProviderService[];
}
