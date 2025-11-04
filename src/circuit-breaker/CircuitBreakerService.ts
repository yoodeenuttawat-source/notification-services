import { Injectable, Optional } from '@nestjs/common';
import { CircuitBreakerState } from './CircuitBreakerState';
import {
  CircuitBreakerMetrics,
  CircuitBreakerConfig,
  CircuitBreakerStrategy
} from './CircuitBreakerStrategy';
import { DefaultCircuitBreakerStrategy } from './DefaultCircuitBreakerStrategy';

@Injectable()
export class CircuitBreakerService {
  private metrics: Map<string, CircuitBreakerMetrics> = new Map();
  private strategies: Map<string, CircuitBreakerStrategy> = new Map();
  private defaultConfig: CircuitBreakerConfig;

  constructor(
    @Optional() defaultConfig?: CircuitBreakerConfig
  ) {
    this.defaultConfig = defaultConfig || {
      failureThreshold: 5,
      successThreshold: 3,
      timeout: 60000, // 60 seconds
      halfOpenMaxCalls: 3
    };
  }

  /**
   * Register a strategy for a specific provider
   */
  registerStrategy(providerName: string, strategy: CircuitBreakerStrategy): void {
    this.strategies.set(providerName, strategy);
  }

  /**
   * Get or create metrics for a provider
   */
  private getMetrics(providerName: string): CircuitBreakerMetrics {
    if (!this.metrics.has(providerName)) {
      this.metrics.set(providerName, {
        failureCount: 0,
        successCount: 0,
        lastFailureTime: null,
        state: CircuitBreakerState.CLOSED,
        lastStateChangeTime: Date.now()
      });
    }
    return this.metrics.get(providerName)!;
  }

  /**
   * Get strategy for provider, fallback to default
   */
  private getStrategy(providerName: string): CircuitBreakerStrategy {
    return this.strategies.get(providerName) || new DefaultCircuitBreakerStrategy();
  }

  /**
   * Check if request should be allowed
   */
  shouldAllowRequest(providerName: string, config?: Partial<CircuitBreakerConfig>): boolean {
    const metrics = this.getMetrics(providerName);
    const strategy = this.getStrategy(providerName);
    const effectiveConfig = { ...this.defaultConfig, ...config };

    // Update state if needed (e.g., OPEN -> HALF_OPEN after timeout)
    this.updateStateIfNeeded(providerName, effectiveConfig);

    const shouldAllow = strategy.shouldAllowRequest(metrics, effectiveConfig);
    return shouldAllow;
  }

  /**
   * Record a successful call
   */
  recordSuccess(providerName: string, config?: Partial<CircuitBreakerConfig>): void {
    const metrics = this.getMetrics(providerName);
    const strategy = this.getStrategy(providerName);
    const effectiveConfig = { ...this.defaultConfig, ...config };

    const newState = strategy.recordSuccess(metrics, effectiveConfig);
    this.updateMetrics(providerName, {
      ...metrics,
      successCount: metrics.state === CircuitBreakerState.HALF_OPEN 
        ? metrics.successCount + 1 
        : 0,
      failureCount: newState === CircuitBreakerState.CLOSED ? 0 : metrics.failureCount,
      state: newState,
      lastStateChangeTime: newState !== metrics.state ? Date.now() : metrics.lastStateChangeTime
    });
  }

  /**
   * Record a failed call
   */
  recordFailure(providerName: string, config?: Partial<CircuitBreakerConfig>): void {
    const metrics = this.getMetrics(providerName);
    const strategy = this.getStrategy(providerName);
    const effectiveConfig = { ...this.defaultConfig, ...config };

    const newState = strategy.recordFailure(metrics, effectiveConfig);
    this.updateMetrics(providerName, {
      ...metrics,
      failureCount: metrics.state === CircuitBreakerState.CLOSED 
        ? metrics.failureCount + 1 
        : (newState === CircuitBreakerState.OPEN ? metrics.failureCount + 1 : metrics.failureCount),
      successCount: newState === CircuitBreakerState.OPEN ? 0 : metrics.successCount,
      lastFailureTime: Date.now(),
      state: newState,
      lastStateChangeTime: newState !== metrics.state ? Date.now() : metrics.lastStateChangeTime
    });
  }

  /**
   * Get current state for a provider
   */
  getState(providerName: string): CircuitBreakerState {
    return this.getMetrics(providerName).state;
  }

  /**
   * Get metrics for a provider
   */
  getMetricsForProvider(providerName: string): CircuitBreakerMetrics {
    return { ...this.getMetrics(providerName) };
  }

  /**
   * Reset circuit breaker for a provider
   */
  reset(providerName: string): void {
    this.metrics.delete(providerName);
  }

  /**
   * Update metrics atomically
   */
  private updateMetrics(providerName: string, newMetrics: CircuitBreakerMetrics): void {
    this.metrics.set(providerName, newMetrics);
  }

  /**
   * Check if state transition is needed (e.g., OPEN -> HALF_OPEN after timeout)
   */
  private updateStateIfNeeded(providerName: string, config: CircuitBreakerConfig): void {
    const metrics = this.getMetrics(providerName);
    
    if (metrics.state === CircuitBreakerState.OPEN && metrics.lastFailureTime) {
      const now = Date.now();
      if ((now - metrics.lastFailureTime) >= config.timeout) {
        // Transition to half-open
        this.updateMetrics(providerName, {
          ...metrics,
          state: CircuitBreakerState.HALF_OPEN,
          lastStateChangeTime: now,
          successCount: 0,
          failureCount: 0
        });
      }
    }
  }
}
