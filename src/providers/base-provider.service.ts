import { CircuitBreakerService } from '../circuit-breaker/CircuitBreakerService';
import { CircuitBreakerConfig } from '../circuit-breaker/CircuitBreakerStrategy';
import { CircuitBreakerOpenError } from '../circuit-breaker/CircuitBreakerOpenError';
import { KafkaService } from '../kafka/kafka.service';
import { KAFKA_TOPICS } from '../kafka/kafka.config';
import { ProviderRequestResponse } from '../kafka/types/provider-request-response';
import { DeliveryLog } from '../kafka/types/delivery-log';

export interface NotificationContext {
  notification_id: string;
  event_id: number;
  event_name: string;
  channel_id: number;
  channel_name: string;
}

export interface NotificationPayload {
  recipient: string;
  subject?: string;
  content: string;
  metadata?: Record<string, any>;
  context?: NotificationContext; // Optional notification context for tracking
}

export interface NotificationResult {
  success: boolean;
  messageId?: string;
  providerName: string;
  provider_request_id?: string; // ID for joining with provider_request_response
}

export abstract class BaseProviderService {
  protected abstract readonly providerName: string;
  protected abstract readonly channelType: 'push' | 'email';

  constructor(
    protected circuitBreakerService: CircuitBreakerService,
    protected kafkaService?: KafkaService,
    protected circuitBreakerConfig?: Partial<CircuitBreakerConfig>
  ) {}

  /**
   * Public method that checks circuit breaker before calling actual implementation
   */
  async sendNotification(payload: NotificationPayload): Promise<NotificationResult> {
    // Check circuit breaker using strategy pattern
    if (
      !this.circuitBreakerService.shouldAllowRequest(this.providerName, this.circuitBreakerConfig)
    ) {
      throw new CircuitBreakerOpenError(
        `Circuit breaker is OPEN for ${this.providerName}. Request rejected.`
      );
    }

    // Use notification_id as provider_request_id for tracking
    const providerRequestId = payload.context?.notification_id || 'unknown';
    const requestTimestamp = new Date().toISOString();
    const request = this.getRequest(payload);
    const headers = this.getHeaders(payload);

    try {
      // Call the actual provider implementation
      const result = await this.executeSend(payload);
      const responseTimestamp = new Date().toISOString();

      // Record success
      this.circuitBreakerService.recordSuccess(this.providerName, this.circuitBreakerConfig);

      // Publish provider request/response if KafkaService is available and context is provided
      if (this.kafkaService && payload.context) {
        await this.publishProviderResponse({
          provider_request_id: providerRequestId,
          notification_id: payload.context.notification_id,
          event_id: payload.context.event_id,
          event_name: payload.context.event_name,
          channel_id: payload.context.channel_id,
          channel_name: payload.context.channel_name,
          provider_name: this.providerName,
          request: JSON.stringify(request),
          request_header: headers,
          response: JSON.stringify({
            success: true,
            messageId: result.messageId,
          }),
          request_timestamp: requestTimestamp,
          response_timestamp: responseTimestamp,
        });

        // Publish delivery log for successful notification (without provider_name)
        await this.publishDeliveryLog({
          notification_id: payload.context.notification_id,
          event_id: payload.context.event_id,
          event_name: payload.context.event_name,
          channel_id: payload.context.channel_id,
          channel_name: payload.context.channel_name,
          stage: 'provider_success',
          status: 'success',
          message_id: result.messageId,
          provider_request_id: providerRequestId,
        });
      }

      return {
        ...result,
        providerName: this.providerName,
        provider_request_id: providerRequestId,
      };
    } catch (error) {
      const responseTimestamp = new Date().toISOString();
      const errorObj = error instanceof Error ? error : new Error(String(error));

      // Record failure
      this.circuitBreakerService.recordFailure(this.providerName, this.circuitBreakerConfig);

      // Publish provider request/response with error if KafkaService is available and context is provided
      if (this.kafkaService && payload.context) {
        await this.publishProviderResponse({
          provider_request_id: providerRequestId,
          notification_id: payload.context.notification_id,
          event_id: payload.context.event_id,
          event_name: payload.context.event_name,
          channel_id: payload.context.channel_id,
          channel_name: payload.context.channel_name,
          provider_name: this.providerName,
          request: JSON.stringify(request),
          request_header: headers,
          response: JSON.stringify({
            success: false,
            error: {
              message: errorObj.message,
              stack: errorObj.stack,
              type: errorObj.constructor.name,
            },
          }),
          request_timestamp: requestTimestamp,
          response_timestamp: responseTimestamp,
        });
      }

      throw error;
    }
  }

  /**
   * Publish provider request/response to Kafka
   */
  private async publishProviderResponse(
    response: Omit<ProviderRequestResponse, 'timestamp'>
  ): Promise<void> {
    if (!this.kafkaService) {
      return; // Skip if KafkaService is not available
    }

    const providerResponse: ProviderRequestResponse = {
      ...response,
      timestamp: new Date().toISOString(),
    };

    await this.kafkaService.publishMessage(KAFKA_TOPICS.PROVIDER_REQUEST_RESPONSE, [
      {
        key: response.provider_request_id,
        value: providerResponse,
      },
    ]);
  }

  /**
   * Publish delivery log to Kafka
   */
  private async publishDeliveryLog(log: Omit<DeliveryLog, 'timestamp'>): Promise<void> {
    if (!this.kafkaService) {
      return; // Skip if KafkaService is not available
    }

    const deliveryLog: DeliveryLog = {
      ...log,
      timestamp: new Date().toISOString(),
    };

    await this.kafkaService.publishMessage(KAFKA_TOPICS.DELIVERY_LOGS, [
      {
        key: log.notification_id,
        value: deliveryLog,
      },
    ]);
  }

  /**
   * Abstract method to be implemented by concrete providers
   */
  protected abstract executeSend(
    payload: NotificationPayload
  ): Promise<Omit<NotificationResult, 'providerName'>>;

  /**
   * Get the request payload to send to provider API
   * Must be implemented by subclasses to customize the request format
   */
  protected abstract getRequest(payload: NotificationPayload): Record<string, any>;

  /**
   * Get the API URL for the provider
   * Must be implemented by subclasses to specify their endpoint
   */
  protected abstract getUrl(): string;

  /**
   * Get HTTP headers for the provider API request
   * Must be implemented by subclasses to customize headers (auth, content-type, etc.)
   */
  protected abstract getHeaders(payload: NotificationPayload): Record<string, string>;

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
