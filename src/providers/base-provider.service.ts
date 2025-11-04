import { CircuitBreakerService } from '../circuit-breaker/CircuitBreakerService';
import { CircuitBreakerConfig } from '../circuit-breaker/CircuitBreakerStrategy';
import { CircuitBreakerOpenError } from '../circuit-breaker/CircuitBreakerOpenError';

export interface NotificationPayload {
  recipient: string;
  subject?: string;
  content: string;
  metadata?: Record<string, any>;
}

export interface NotificationResult {
  success: boolean;
  messageId?: string;
  providerName: string;
}

export abstract class BaseProviderService {
  protected abstract readonly providerName: string;
  protected abstract readonly channelType: 'push' | 'email';

  constructor(
    protected circuitBreakerService: CircuitBreakerService,
    protected circuitBreakerConfig?: Partial<CircuitBreakerConfig>
  ) {}

  /**
   * Public method that checks circuit breaker before calling actual implementation
   */
  async sendNotification(payload: NotificationPayload): Promise<NotificationResult> {
    // Check circuit breaker using strategy pattern
    if (!this.circuitBreakerService.shouldAllowRequest(this.providerName, this.circuitBreakerConfig)) {
      throw new CircuitBreakerOpenError(
        `Circuit breaker is OPEN for ${this.providerName}. Request rejected.`
      );
    }

    try {
      // Call the actual provider implementation
      const result = await this.executeSend(payload);
      
      // Record success
      this.circuitBreakerService.recordSuccess(this.providerName, this.circuitBreakerConfig);
      
      return {
        ...result,
        providerName: this.providerName
      };
    } catch (error) {
      // Record failure
      this.circuitBreakerService.recordFailure(this.providerName, this.circuitBreakerConfig);
      
      throw error;
    }
  }

  /**
   * Abstract method to be implemented by concrete providers
   */
  protected abstract executeSend(payload: NotificationPayload): Promise<Omit<NotificationResult, 'providerName'>>;

  /**
   * Get current circuit breaker state
   */
  getCircuitBreakerState() {
    return this.circuitBreakerService.getState(this.providerName);
  }

  /**
   * Get provider name
   */
  getName(): string {
    return this.providerName;
  }

  /**
   * Get channel type
   */
  getChannelType(): 'push' | 'email' {
    return this.channelType;
  }
}

