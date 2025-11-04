import { CircuitBreakerState } from './CircuitBreakerState';
import { CircuitBreakerMetrics, CircuitBreakerConfig, CircuitBreakerStrategy } from './CircuitBreakerStrategy';
export declare class CircuitBreakerService {
    private metrics;
    private strategies;
    private defaultConfig;
    constructor(defaultConfig?: CircuitBreakerConfig);
    registerStrategy(providerName: string, strategy: CircuitBreakerStrategy): void;
    private getMetrics;
    private getStrategy;
    shouldAllowRequest(providerName: string, config?: Partial<CircuitBreakerConfig>): boolean;
    recordSuccess(providerName: string, config?: Partial<CircuitBreakerConfig>): void;
    recordFailure(providerName: string, config?: Partial<CircuitBreakerConfig>): void;
    getState(providerName: string): CircuitBreakerState;
    getMetricsForProvider(providerName: string): CircuitBreakerMetrics;
    reset(providerName: string): void;
    private updateMetrics;
    private updateStateIfNeeded;
}
