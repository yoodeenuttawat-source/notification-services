import { BaseProviderService, NotificationPayload, NotificationResult } from '../base-provider.service';
import { CircuitBreakerService } from '../../circuit-breaker/CircuitBreakerService';
import { CircuitBreakerConfig } from '../../circuit-breaker/CircuitBreakerStrategy';
import { KafkaService } from '../../kafka/kafka.service';
export declare class EmailProviderService2 extends BaseProviderService {
    protected readonly providerName = "EmailProvider2";
    protected readonly channelType: "email";
    private readonly logger;
    constructor(circuitBreakerService: CircuitBreakerService, kafkaService?: KafkaService, circuitBreakerConfig?: Partial<CircuitBreakerConfig>);
    protected getRequest(payload: NotificationPayload): Record<string, any>;
    protected getUrl(): string;
    protected getHeaders(payload: NotificationPayload): Record<string, string>;
    protected executeSend(payload: NotificationPayload): Promise<Omit<NotificationResult, 'providerName'>>;
}
