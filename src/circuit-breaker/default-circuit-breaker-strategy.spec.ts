import { DefaultCircuitBreakerStrategy } from './DefaultCircuitBreakerStrategy';
import { CircuitBreakerState } from './CircuitBreakerState';
import { CircuitBreakerMetrics, CircuitBreakerConfig } from './CircuitBreakerStrategy';

describe('DefaultCircuitBreakerStrategy', () => {
  let strategy: DefaultCircuitBreakerStrategy;
  const defaultConfig: CircuitBreakerConfig = {
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 60000,
    halfOpenMaxCalls: 3
  };

  beforeEach(() => {
    strategy = new DefaultCircuitBreakerStrategy();
  });

  describe('shouldAllowRequest', () => {
    it('should allow request when CLOSED', () => {
      const metrics: CircuitBreakerMetrics = {
        failureCount: 0,
        successCount: 0,
        lastFailureTime: null,
        state: CircuitBreakerState.CLOSED,
        lastStateChangeTime: Date.now()
      };

      expect(strategy.shouldAllowRequest(metrics, defaultConfig)).toBe(true);
    });

    it('should not allow request when OPEN and timeout not passed', () => {
      const metrics: CircuitBreakerMetrics = {
        failureCount: 5,
        successCount: 0,
        lastFailureTime: Date.now() - 1000, // 1 second ago
        state: CircuitBreakerState.OPEN,
        lastStateChangeTime: Date.now() - 1000
      };

      expect(strategy.shouldAllowRequest(metrics, defaultConfig)).toBe(false);
    });

    it('should allow request when OPEN and timeout passed', () => {
      const metrics: CircuitBreakerMetrics = {
        failureCount: 5,
        successCount: 0,
        lastFailureTime: Date.now() - 61000, // More than timeout
        state: CircuitBreakerState.OPEN,
        lastStateChangeTime: Date.now() - 61000
      };

      expect(strategy.shouldAllowRequest(metrics, defaultConfig)).toBe(true);
    });

    it('should allow limited requests when HALF_OPEN', () => {
      const metrics: CircuitBreakerMetrics = {
        failureCount: 0,
        successCount: 0,
        lastFailureTime: null,
        state: CircuitBreakerState.HALF_OPEN,
        lastStateChangeTime: Date.now()
      };

      expect(strategy.shouldAllowRequest(metrics, defaultConfig)).toBe(true);
    });

    it('should not allow request when HALF_OPEN max calls reached', () => {
      const metrics: CircuitBreakerMetrics = {
        failureCount: 0,
        successCount: 3, // At max calls
        lastFailureTime: null,
        state: CircuitBreakerState.HALF_OPEN,
        lastStateChangeTime: Date.now()
      };

      expect(strategy.shouldAllowRequest(metrics, defaultConfig)).toBe(false);
    });
  });

  describe('recordSuccess', () => {
    it('should remain CLOSED on success when CLOSED', () => {
      const metrics: CircuitBreakerMetrics = {
        failureCount: 2,
        successCount: 0,
        lastFailureTime: null,
        state: CircuitBreakerState.CLOSED,
        lastStateChangeTime: Date.now()
      };

      const newState = strategy.recordSuccess(metrics, defaultConfig);
      expect(newState).toBe(CircuitBreakerState.CLOSED);
    });

    it('should transition HALF_OPEN to CLOSED when success threshold reached', () => {
      const metrics: CircuitBreakerMetrics = {
        failureCount: 0,
        successCount: 2, // One away from threshold
        lastFailureTime: null,
        state: CircuitBreakerState.HALF_OPEN,
        lastStateChangeTime: Date.now()
      };

      const newState = strategy.recordSuccess(metrics, defaultConfig);
      expect(newState).toBe(CircuitBreakerState.CLOSED);
    });

    it('should remain HALF_OPEN when success threshold not reached', () => {
      const metrics: CircuitBreakerMetrics = {
        failureCount: 0,
        successCount: 1,
        lastFailureTime: null,
        state: CircuitBreakerState.HALF_OPEN,
        lastStateChangeTime: Date.now()
      };

      const newState = strategy.recordSuccess(metrics, defaultConfig);
      expect(newState).toBe(CircuitBreakerState.HALF_OPEN);
    });
  });

  describe('recordFailure', () => {
    it('should remain CLOSED when failure threshold not reached', () => {
      const metrics: CircuitBreakerMetrics = {
        failureCount: 3,
        successCount: 0,
        lastFailureTime: Date.now(),
        state: CircuitBreakerState.CLOSED,
        lastStateChangeTime: Date.now()
      };

      const newState = strategy.recordFailure(metrics, defaultConfig);
      expect(newState).toBe(CircuitBreakerState.CLOSED);
    });

    it('should transition CLOSED to OPEN when failure threshold reached', () => {
      const metrics: CircuitBreakerMetrics = {
        failureCount: 4, // One away from threshold
        successCount: 0,
        lastFailureTime: Date.now(),
        state: CircuitBreakerState.CLOSED,
        lastStateChangeTime: Date.now()
      };

      const newState = strategy.recordFailure(metrics, defaultConfig);
      expect(newState).toBe(CircuitBreakerState.OPEN);
    });

    it('should transition HALF_OPEN to OPEN on any failure', () => {
      const metrics: CircuitBreakerMetrics = {
        failureCount: 0,
        successCount: 1,
        lastFailureTime: null,
        state: CircuitBreakerState.HALF_OPEN,
        lastStateChangeTime: Date.now()
      };

      const newState = strategy.recordFailure(metrics, defaultConfig);
      expect(newState).toBe(CircuitBreakerState.OPEN);
    });

    it('should remain OPEN on failure when already OPEN', () => {
      const metrics: CircuitBreakerMetrics = {
        failureCount: 5,
        successCount: 0,
        lastFailureTime: Date.now(),
        state: CircuitBreakerState.OPEN,
        lastStateChangeTime: Date.now()
      };

      const newState = strategy.recordFailure(metrics, defaultConfig);
      expect(newState).toBe(CircuitBreakerState.OPEN);
    });
  });

  describe('edge cases', () => {
    it('should handle recordSuccess with OPEN state', () => {
      const metrics: CircuitBreakerMetrics = {
        failureCount: 5,
        successCount: 0,
        lastFailureTime: Date.now(),
        state: CircuitBreakerState.OPEN,
        lastStateChangeTime: Date.now()
      };

      const newState = strategy.recordSuccess(metrics, defaultConfig);
      expect(newState).toBe(CircuitBreakerState.HALF_OPEN);
    });

    it('should handle recordSuccess when just below threshold', () => {
      const metrics: CircuitBreakerMetrics = {
        failureCount: 0,
        successCount: 1, // One below threshold
        lastFailureTime: null,
        state: CircuitBreakerState.HALF_OPEN,
        lastStateChangeTime: Date.now()
      };

      const newState = strategy.recordSuccess(metrics, defaultConfig);
      expect(newState).toBe(CircuitBreakerState.HALF_OPEN);
    });
  });
});

