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

export class EmailProviderService1 extends BaseProviderService {
  protected readonly providerName = 'EmailProvider1';
  protected readonly channelType = 'email' as const;
  private readonly logger = new Logger(EmailProviderService1.name);

  constructor(
    circuitBreakerService: CircuitBreakerService,
    kafkaService?: KafkaService,
    circuitBreakerConfig?: Partial<CircuitBreakerConfig>
  ) {
    super(circuitBreakerService, kafkaService, {
      failureThreshold: 5,
      timeout: 60000,
      ...circuitBreakerConfig,
    });
  }

  protected getRequest(payload: NotificationPayload): Record<string, any> {
    const idempotentKey = payload.context?.notification_id || 'unknown';
    return {
      recipient: payload.recipient,
      subject: payload.subject,
      content: payload.content,
      metadata: payload.metadata,
      idempotentKey: idempotentKey,
      from: process.env.EMAIL_FROM || 'noreply@example.com',
      to: payload.recipient,
    };
  }

  protected getUrl(): string {
    return (
      process.env.EMAIL_PROVIDER1_API_URL ||
      process.env.PROVIDER_API_URL ||
      'https://api.email-provider1.com/v1/send'
    );
  }

  protected getHeaders(payload: NotificationPayload): Record<string, string> {
    const idempotentKey = payload.context?.notification_id || 'unknown';
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.PROVIDER_API_KEY || ''}`,
      'X-Idempotent-Key': idempotentKey,
      'X-Provider': 'EmailProvider1',
      'X-Provider-Version': '1.0',
    };
  }

  protected async executeSend(
    payload: NotificationPayload
  ): Promise<Omit<NotificationResult, 'providerName'>> {
    if (!payload.subject) {
      throw new Error('Email requires subject');
    }

    const messageId = uuidv4();
    const idempotentKey = payload.context?.notification_id || 'unknown';
    const request = this.getRequest(payload);
    const headers = this.getHeaders(payload);
    const url = this.getUrl();

    this.logger.log(
      JSON.stringify({
        provider: this.providerName,
        action: 'sending_email_notification',
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
