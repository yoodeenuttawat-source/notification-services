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
  failureThreshold: number; // Open circuit after N failures
  successThreshold: number; // Close circuit after N successes in half-open
  timeout: number; // Time to wait before half-open (ms)
  halfOpenMaxCalls: number; // Max calls to allow in half-open state
}

export interface CircuitBreakerStrategy {
  /**
   * Determine if request should be allowed based on current state
   */
  shouldAllowRequest(metrics: CircuitBreakerMetrics, config: CircuitBreakerConfig): boolean;

  /**
   * Update state based on success
   */
  recordSuccess(metrics: CircuitBreakerMetrics, config: CircuitBreakerConfig): CircuitBreakerState;

  /**
   * Update state based on failure
   */
  recordFailure(metrics: CircuitBreakerMetrics, config: CircuitBreakerConfig): CircuitBreakerState;
}
