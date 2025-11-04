import { CircuitBreakerState } from './CircuitBreakerState';
export { CircuitBreakerState };
export interface CircuitBreakerMetrics {
    failureCount: number;
    successCount: number;
    lastFailureTime: number | null;
    state: CircuitBreakerState;
    lastStateChangeTime: number;
}
export interface CircuitBreakerConfig {
    failureThreshold: number;
    successThreshold: number;
    timeout: number;
    halfOpenMaxCalls: number;
}
export interface CircuitBreakerStrategy {
    shouldAllowRequest(metrics: CircuitBreakerMetrics, config: CircuitBreakerConfig): boolean;
    recordSuccess(metrics: CircuitBreakerMetrics, config: CircuitBreakerConfig): CircuitBreakerState;
    recordFailure(metrics: CircuitBreakerMetrics, config: CircuitBreakerConfig): CircuitBreakerState;
}
