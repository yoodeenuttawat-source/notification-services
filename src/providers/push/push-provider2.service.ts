import {
  BaseProviderService,
  NotificationPayload,
  NotificationResult,
} from '../base-provider.service';
import { CircuitBreakerService } from '../../circuit-breaker/CircuitBreakerService';
import { CircuitBreakerConfig } from '../../circuit-breaker/CircuitBreakerStrategy';
import { KafkaService } from '../../kafka/kafka.service';
import { Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

export class PushProviderService2 extends BaseProviderService {
  protected readonly providerName = 'PushProvider2';
  protected readonly channelType = 'push' as const;
  private readonly logger = new Logger(PushProviderService2.name);

  constructor(
    circuitBreakerService: CircuitBreakerService,
    kafkaService?: KafkaService,
    circuitBreakerConfig?: Partial<CircuitBreakerConfig>
  ) {
    super(circuitBreakerService, kafkaService, {
      failureThreshold: 3, // Different threshold for this provider
      timeout: 45000,
      ...circuitBreakerConfig,
    });
  }

  protected getRequest(payload: NotificationPayload): Record<string, any> {
    const idempotentKey = payload.context?.notification_id || 'unknown';
    return {
      target: payload.recipient,
      notification: {
        title: payload.subject || null,
        message: payload.content,
      },
      metadata: payload.metadata,
      idempotentKey: idempotentKey,
    };
  }

  protected getUrl(): string {
    return (
      process.env.PUSH_PROVIDER2_API_URL ||
      process.env.PROVIDER_API_URL ||
      'https://api.push-provider2.com/v1/notifications'
    );
  }

  protected getHeaders(payload: NotificationPayload): Record<string, string> {
    const idempotentKey = payload.context?.notification_id || 'unknown';
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.PROVIDER_API_KEY || ''}`,
      'X-Idempotent-Key': idempotentKey,
      'X-Provider': 'PushProvider2',
      'X-Provider-Version': '2.0',
    };
  }

  protected async executeSend(
    payload: NotificationPayload
  ): Promise<Omit<NotificationResult, 'providerName'>> {
    const messageId = uuidv4();
    const idempotentKey = payload.context?.notification_id || 'unknown';
    const request = this.getRequest(payload);
    const headers = this.getHeaders(payload);
    const url = this.getUrl();

    this.logger.log(
      JSON.stringify({
        provider: this.providerName,
        action: 'sending_push_notification',
        url,
        headers,
        request,
        messageId,
        idempotentKey: idempotentKey,
      })
    );

    return {
      success: true,
      messageId: messageId,
    };
  }
}
