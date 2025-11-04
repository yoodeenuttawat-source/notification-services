import { BaseProviderService, NotificationPayload, NotificationResult } from '../base-provider.service';
import { CircuitBreakerService } from '../../circuit-breaker/CircuitBreakerService';
import { CircuitBreakerConfig } from '../../circuit-breaker/CircuitBreakerStrategy';
import { KafkaService } from '../../kafka/kafka.service';
export declare class PushProviderService1 extends BaseProviderService {
    protected readonly providerName = "PushProvider1";
    protected readonly channelType: "push";
    private readonly logger;
    constructor(circuitBreakerService: CircuitBreakerService, kafkaService?: KafkaService, circuitBreakerConfig?: Partial<CircuitBreakerConfig>);
    protected getRequest(payload: NotificationPayload): Record<string, any>;
    protected getUrl(): string;
    protected getHeaders(payload: NotificationPayload): Record<string, string>;
    protected executeSend(payload: NotificationPayload): Promise<Omit<NotificationResult, 'providerName'>>;
}
