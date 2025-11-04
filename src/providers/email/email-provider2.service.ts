import { BaseProviderService, NotificationPayload, NotificationResult } from '../base-provider.service';
import { CircuitBreakerService } from '../../circuit-breaker/CircuitBreakerService';
import { CircuitBreakerConfig } from '../../circuit-breaker/CircuitBreakerStrategy';
import { v4 as uuidv4 } from 'uuid';

export class EmailProviderService2 extends BaseProviderService {
  protected readonly providerName = 'EmailProvider2';
  protected readonly channelType = 'email' as const;

  constructor(
    circuitBreakerService: CircuitBreakerService,
    circuitBreakerConfig?: Partial<CircuitBreakerConfig>
  ) {
    super(circuitBreakerService, {
      failureThreshold: 5,
      timeout: 60000,
      ...circuitBreakerConfig
    });
  }

  protected async executeSend(payload: NotificationPayload): Promise<Omit<NotificationResult, 'providerName'>> {
    if (!payload.subject) {
      throw new Error('Email requires subject');
    }

    const messageId = uuidv4();
    
    console.log(`[${this.providerName}] Sending email notification:`);
    console.log(`  From: ${process.env.EMAIL_FROM || 'noreply@example.com'}`);
    console.log(`  To: ${payload.recipient}`);
    console.log(`  Subject: ${payload.subject}`);
    console.log(`  Content: ${payload.content}`);
    console.log(`  Metadata:`, JSON.stringify(payload.metadata || {}, null, 2));
    console.log(`  Message ID: ${messageId}`);

    return {
      success: true,
      messageId: messageId
    };
  }
}

