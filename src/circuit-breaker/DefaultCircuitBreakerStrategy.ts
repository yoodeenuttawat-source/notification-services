import { CircuitBreakerState } from './CircuitBreakerState';
import {
  CircuitBreakerStrategy,
  CircuitBreakerMetrics,
  CircuitBreakerConfig,
} from './CircuitBreakerStrategy';

export class DefaultCircuitBreakerStrategy implements CircuitBreakerStrategy {
  shouldAllowRequest(metrics: CircuitBreakerMetrics, config: CircuitBreakerConfig): boolean {
    const now = Date.now();

    switch (metrics.state) {
      case CircuitBreakerState.CLOSED:
        return true;

      case CircuitBreakerState.OPEN:
        // Check if timeout has passed to allow half-open
        if (metrics.lastFailureTime && now - metrics.lastFailureTime >= config.timeout) {
          return true; // Allow transition to half-open
        }
        return false;

      case CircuitBreakerState.HALF_OPEN:
        // Allow limited requests in half-open state
        return metrics.successCount + metrics.failureCount < config.halfOpenMaxCalls;

      default:
        return false;
    }
  }

  recordSuccess(metrics: CircuitBreakerMetrics, config: CircuitBreakerConfig): CircuitBreakerState {
    switch (metrics.state) {
      case CircuitBreakerState.CLOSED:
        // Reset failure count on success
        return CircuitBreakerState.CLOSED;

      case CircuitBreakerState.HALF_OPEN:
        // If we have enough successes, close the circuit
        if (metrics.successCount + 1 >= config.successThreshold) {
          return CircuitBreakerState.CLOSED;
        }
        return CircuitBreakerState.HALF_OPEN;

      case CircuitBreakerState.OPEN:
        // Transition to half-open on first success after timeout
        return CircuitBreakerState.HALF_OPEN;

      default:
        return metrics.state;
    }
  }

  recordFailure(metrics: CircuitBreakerMetrics, config: CircuitBreakerConfig): CircuitBreakerState {
    switch (metrics.state) {
      case CircuitBreakerState.CLOSED:
        // If failure threshold reached, open the circuit
        if (metrics.failureCount + 1 >= config.failureThreshold) {
          return CircuitBreakerState.OPEN;
        }
        return CircuitBreakerState.CLOSED;

      case CircuitBreakerState.HALF_OPEN:
        // Any failure in half-open immediately opens circuit
        return CircuitBreakerState.OPEN;

      case CircuitBreakerState.OPEN:
        // Already open, stay open
        return CircuitBreakerState.OPEN;

      default:
        return metrics.state;
    }
  }
}
