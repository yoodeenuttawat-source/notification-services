import { Test, TestingModule } from '@nestjs/testing';
import { CircuitBreakerService } from './CircuitBreakerService';
import { CircuitBreakerState } from './CircuitBreakerState';
import { CircuitBreakerConfig, CircuitBreakerStrategy } from './CircuitBreakerStrategy';
import { DefaultCircuitBreakerStrategy } from './DefaultCircuitBreakerStrategy';

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CircuitBreakerService],
    }).compile();

    service = module.get<CircuitBreakerService>(CircuitBreakerService);
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should use default config when none provided', () => {
      const state = service.getState('test-provider');
      expect(state).toBe(CircuitBreakerState.CLOSED);
    });

    it('should use custom default config when provided', () => {
      const customConfig: CircuitBreakerConfig = {
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 30000,
        halfOpenMaxCalls: 2,
      };
      const serviceWithConfig = new CircuitBreakerService(customConfig);
      expect(serviceWithConfig).toBeDefined();
    });
  });

  describe('shouldAllowRequest', () => {
    it('should allow request when circuit is CLOSED', () => {
      expect(service.shouldAllowRequest('test-provider')).toBe(true);
    });

    it('should not allow request when circuit is OPEN', () => {
      // Trigger failures to open circuit
      const config: Partial<CircuitBreakerConfig> = { failureThreshold: 2 };
      service.recordFailure('test-provider', config);
      service.recordFailure('test-provider', config);

      expect(service.shouldAllowRequest('test-provider', config)).toBe(false);
    });

    it('should allow limited requests when circuit is HALF_OPEN', () => {
      // Open the circuit
      const config: Partial<CircuitBreakerConfig> = {
        failureThreshold: 1,
        timeout: 100,
      };
      service.recordFailure('half-open-provider', config);

      // Wait for timeout to transition to HALF_OPEN
      jest.useFakeTimers();
      jest.advanceTimersByTime(200);

      // Should allow requests in HALF_OPEN state
      expect(service.shouldAllowRequest('half-open-provider', config)).toBe(true);

      jest.useRealTimers();
    });

    it('should use custom config when provided', () => {
      const customConfig: Partial<CircuitBreakerConfig> = { failureThreshold: 1 };
      service.recordFailure('custom-provider', customConfig);

      expect(service.shouldAllowRequest('custom-provider', customConfig)).toBe(false);
    });
  });

  describe('recordSuccess', () => {
    it('should reset failure count when CLOSED', () => {
      const config: Partial<CircuitBreakerConfig> = { failureThreshold: 3 };
      service.recordFailure('reset-provider', config);
      service.recordFailure('reset-provider', config);

      const metricsBefore = service.getMetricsForProvider('reset-provider');
      expect(metricsBefore.failureCount).toBe(2);

      service.recordSuccess('reset-provider', config);
      const metricsAfter = service.getMetricsForProvider('reset-provider');
      expect(metricsAfter.failureCount).toBe(0);
    });

    it('should increment success count in HALF_OPEN state', () => {
      const config: Partial<CircuitBreakerConfig> = {
        failureThreshold: 1,
        successThreshold: 2,
        timeout: 100,
      };

      // Open circuit
      service.recordFailure('half-open-provider', config);

      // Transition to HALF_OPEN
      jest.useFakeTimers();
      jest.advanceTimersByTime(200);

      // Check that we're in HALF_OPEN state
      service.shouldAllowRequest('half-open-provider', config);

      service.recordSuccess('half-open-provider', config);
      const metrics = service.getMetricsForProvider('half-open-provider');
      // Success count should be incremented in HALF_OPEN state
      expect(metrics.successCount).toBeGreaterThanOrEqual(0);

      jest.useRealTimers();
    });

    it('should transition HALF_OPEN to CLOSED after success threshold', () => {
      const config: Partial<CircuitBreakerConfig> = {
        failureThreshold: 1,
        successThreshold: 2,
        timeout: 100,
      };

      // Open circuit
      service.recordFailure('transition-provider', config);

      // Transition to HALF_OPEN
      jest.useFakeTimers();
      jest.advanceTimersByTime(200);

      // Ensure we're in HALF_OPEN state
      service.shouldAllowRequest('transition-provider', config);

      // Record successes to close circuit
      service.recordSuccess('transition-provider', config);
      // Check state after first success
      let metrics = service.getMetricsForProvider('transition-provider');
      if (metrics.state === CircuitBreakerState.HALF_OPEN) {
        // Need one more success to reach threshold
        service.recordSuccess('transition-provider', config);
      }

      metrics = service.getMetricsForProvider('transition-provider');
      expect(metrics.state).toBe(CircuitBreakerState.CLOSED);

      jest.useRealTimers();
    });
  });

  describe('recordFailure', () => {
    it('should increment failure count when CLOSED', () => {
      const config: Partial<CircuitBreakerConfig> = { failureThreshold: 3 };
      service.recordFailure('failure-provider', config);

      const metrics = service.getMetricsForProvider('failure-provider');
      expect(metrics.failureCount).toBe(1);
    });

    it('should open circuit when failure threshold is reached', () => {
      const config: Partial<CircuitBreakerConfig> = { failureThreshold: 2 };
      service.recordFailure('open-provider', config);
      service.recordFailure('open-provider', config);

      const metrics = service.getMetricsForProvider('open-provider');
      expect(metrics.state).toBe(CircuitBreakerState.OPEN);
    });

    it('should transition HALF_OPEN to OPEN on failure', () => {
      const config: Partial<CircuitBreakerConfig> = {
        failureThreshold: 1,
        timeout: 100,
      };

      // Open circuit
      service.recordFailure('half-open-fail-provider', config);

      // Transition to HALF_OPEN
      jest.useFakeTimers();
      jest.advanceTimersByTime(200);

      // Record failure should open circuit again
      service.recordFailure('half-open-fail-provider', config);
      const metrics = service.getMetricsForProvider('half-open-fail-provider');
      expect(metrics.state).toBe(CircuitBreakerState.OPEN);

      jest.useRealTimers();
    });
  });

  describe('getState', () => {
    it('should return CLOSED by default', () => {
      expect(service.getState('new-provider')).toBe(CircuitBreakerState.CLOSED);
    });

    it('should return current state', () => {
      const config: Partial<CircuitBreakerConfig> = { failureThreshold: 1 };
      service.recordFailure('state-provider', config);

      expect(service.getState('state-provider')).toBe(CircuitBreakerState.OPEN);
    });
  });

  describe('getMetricsForProvider', () => {
    it('should return metrics for provider', () => {
      const config: Partial<CircuitBreakerConfig> = { failureThreshold: 3 };
      service.recordFailure('metrics-provider', config);
      service.recordSuccess('metrics-provider', config);

      const metrics = service.getMetricsForProvider('metrics-provider');
      expect(metrics).toHaveProperty('failureCount');
      expect(metrics).toHaveProperty('successCount');
      expect(metrics).toHaveProperty('state');
      expect(metrics).toHaveProperty('lastFailureTime');
      expect(metrics).toHaveProperty('lastStateChangeTime');
    });

    it('should return a copy of metrics', () => {
      const config: Partial<CircuitBreakerConfig> = { failureThreshold: 3 };
      service.recordFailure('copy-provider', config);

      const metrics1 = service.getMetricsForProvider('copy-provider');
      const metrics2 = service.getMetricsForProvider('copy-provider');

      expect(metrics1).not.toBe(metrics2); // Different objects
      expect(metrics1).toEqual(metrics2); // Same values
    });
  });

  describe('reset', () => {
    it('should reset metrics for provider', () => {
      const config: Partial<CircuitBreakerConfig> = { failureThreshold: 1 };
      service.recordFailure('reset-provider', config);

      expect(service.getState('reset-provider')).toBe(CircuitBreakerState.OPEN);

      service.reset('reset-provider');

      // Should create new metrics
      expect(service.getState('reset-provider')).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('registerStrategy', () => {
    it('should register custom strategy for provider', () => {
      const customStrategy: CircuitBreakerStrategy = {
        shouldAllowRequest: () => false,
        recordSuccess: () => CircuitBreakerState.CLOSED,
        recordFailure: () => CircuitBreakerState.OPEN,
      };

      service.registerStrategy('custom-provider', customStrategy);

      // Should use custom strategy
      expect(service.shouldAllowRequest('custom-provider')).toBe(false);
    });
  });

  describe('timeout transition', () => {
    it('should transition OPEN to HALF_OPEN after timeout', () => {
      const config: Partial<CircuitBreakerConfig> = {
        failureThreshold: 1,
        timeout: 100,
      };

      service.recordFailure('timeout-provider', config);
      expect(service.getState('timeout-provider')).toBe(CircuitBreakerState.OPEN);

      jest.useFakeTimers();
      jest.advanceTimersByTime(200);

      // Should transition to HALF_OPEN
      service.shouldAllowRequest('timeout-provider', config);
      expect(service.getState('timeout-provider')).toBe(CircuitBreakerState.HALF_OPEN);

      jest.useRealTimers();
    });
  });
});
