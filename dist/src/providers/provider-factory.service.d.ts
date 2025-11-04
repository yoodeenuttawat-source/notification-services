import { CircuitBreakerService } from '../circuit-breaker/CircuitBreakerService';
import { BaseProviderService } from './base-provider.service';
export declare class ProviderFactoryService {
    private readonly circuitBreakerService;
    private providers;
    constructor(circuitBreakerService: CircuitBreakerService);
    getProvider(name: string): BaseProviderService | undefined;
    getAllProviders(): BaseProviderService[];
}
