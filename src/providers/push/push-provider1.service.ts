import { BaseProviderService, NotificationPayload, NotificationResult } from '../base-provider.service';
import { CircuitBreakerService } from '../../circuit-breaker/CircuitBreakerService';
import { CircuitBreakerConfig } from '../../circuit-breaker/CircuitBreakerStrategy';
import { v4 as uuidv4 } from 'uuid';

export class PushProviderService1 extends BaseProviderService {
  protected readonly providerName = 'PushProvider1';
  protected readonly channelType = 'push' as const;

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
    const messageId = uuidv4();
    
    console.log(`[${this.providerName}] Sending push notification:`);
    console.log(`  Recipient: ${payload.recipient}`);
    console.log(`  Subject: ${payload.subject || 'N/A'}`);
    console.log(`  Content: ${payload.content}`);
    console.log(`  Metadata:`, JSON.stringify(payload.metadata || {}, null, 2));
    console.log(`  Message ID: ${messageId}`);

    return {
      success: true,
      messageId: messageId
    };
  }
}

