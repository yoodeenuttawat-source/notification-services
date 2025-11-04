import { CircuitBreakerService } from '../circuit-breaker/CircuitBreakerService';
import { CircuitBreakerConfig } from '../circuit-breaker/CircuitBreakerStrategy';
export interface NotificationPayload {
    recipient: string;
    subject?: string;
    content: string;
    metadata?: Record<string, any>;
}
export interface NotificationResult {
    success: boolean;
    messageId?: string;
    providerName: string;
}
export declare abstract class BaseProviderService {
    protected circuitBreakerService: CircuitBreakerService;
    protected circuitBreakerConfig?: Partial<CircuitBreakerConfig>;
    protected abstract readonly providerName: string;
    protected abstract readonly channelType: 'push' | 'email';
    constructor(circuitBreakerService: CircuitBreakerService, circuitBreakerConfig?: Partial<CircuitBreakerConfig>);
    sendNotification(payload: NotificationPayload): Promise<NotificationResult>;
    protected abstract executeSend(payload: NotificationPayload): Promise<Omit<NotificationResult, 'providerName'>>;
    getCircuitBreakerState(): import("../circuit-breaker/CircuitBreakerState").CircuitBreakerState;
    getName(): string;
    getChannelType(): 'push' | 'email';
}
