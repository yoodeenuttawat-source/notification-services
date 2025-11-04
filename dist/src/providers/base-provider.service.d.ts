import { CircuitBreakerService } from '../circuit-breaker/CircuitBreakerService';
import { CircuitBreakerConfig } from '../circuit-breaker/CircuitBreakerStrategy';
import { KafkaService } from '../kafka/kafka.service';
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
    context?: NotificationContext;
}
export interface NotificationResult {
    success: boolean;
    messageId?: string;
    providerName: string;
    provider_request_id?: string;
}
export declare abstract class BaseProviderService {
    protected circuitBreakerService: CircuitBreakerService;
    protected kafkaService?: KafkaService;
    protected circuitBreakerConfig?: Partial<CircuitBreakerConfig>;
    protected abstract readonly providerName: string;
    protected abstract readonly channelType: 'push' | 'email';
    constructor(circuitBreakerService: CircuitBreakerService, kafkaService?: KafkaService, circuitBreakerConfig?: Partial<CircuitBreakerConfig>);
    sendNotification(payload: NotificationPayload): Promise<NotificationResult>;
    private publishProviderResponse;
    private publishDeliveryLog;
    protected abstract executeSend(payload: NotificationPayload): Promise<Omit<NotificationResult, 'providerName'>>;
    protected abstract getRequest(payload: NotificationPayload): Record<string, any>;
    protected abstract getUrl(): string;
    protected abstract getHeaders(payload: NotificationPayload): Record<string, string>;
    getCircuitBreakerState(): import("../circuit-breaker/CircuitBreakerState").CircuitBreakerState;
    getName(): string;
    getChannelType(): 'push' | 'email';
}
