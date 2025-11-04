import { BaseProviderService, NotificationPayload, NotificationResult } from '../base-provider.service';
import { CircuitBreakerService } from '../../circuit-breaker/CircuitBreakerService';
import { CircuitBreakerConfig } from '../../circuit-breaker/CircuitBreakerStrategy';
export declare class EmailProviderService2 extends BaseProviderService {
    protected readonly providerName = "EmailProvider2";
    protected readonly channelType: "email";
    constructor(circuitBreakerService: CircuitBreakerService, circuitBreakerConfig?: Partial<CircuitBreakerConfig>);
    protected executeSend(payload: NotificationPayload): Promise<Omit<NotificationResult, 'providerName'>>;
}
