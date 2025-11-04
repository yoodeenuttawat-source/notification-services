import { CircuitBreakerState } from './CircuitBreakerState';
import { CircuitBreakerStrategy, CircuitBreakerMetrics, CircuitBreakerConfig } from './CircuitBreakerStrategy';
export declare class DefaultCircuitBreakerStrategy implements CircuitBreakerStrategy {
    shouldAllowRequest(metrics: CircuitBreakerMetrics, config: CircuitBreakerConfig): boolean;
    recordSuccess(metrics: CircuitBreakerMetrics, config: CircuitBreakerConfig): CircuitBreakerState;
    recordFailure(metrics: CircuitBreakerMetrics, config: CircuitBreakerConfig): CircuitBreakerState;
}
