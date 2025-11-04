import { BaseProviderService, NotificationPayload, NotificationResult } from '../base-provider.service';
import { CircuitBreakerService } from '../../circuit-breaker/CircuitBreakerService';
import { CircuitBreakerConfig } from '../../circuit-breaker/CircuitBreakerStrategy';
export declare class PushProviderService2 extends BaseProviderService {
    protected readonly providerName = "PushProvider2";
    protected readonly channelType: "push";
    constructor(circuitBreakerService: CircuitBreakerService, circuitBreakerConfig?: Partial<CircuitBreakerConfig>);
    protected executeSend(payload: NotificationPayload): Promise<Omit<NotificationResult, 'providerName'>>;
}
