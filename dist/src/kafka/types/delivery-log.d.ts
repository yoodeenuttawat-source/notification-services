export interface DeliveryLog {
    notification_id: string;
    event_id: number;
    event_name: string;
    channel_id: number;
    channel_name: string;
    provider_name?: string;
    provider_request_id?: string;
    stage: 'routed' | 'provider_called' | 'provider_success' | 'provider_failed' | 'circuit_breaker_open' | 'processing_failed';
    status: 'pending' | 'success' | 'failed';
    error_message?: string;
    message_id?: string;
    timestamp: string;
    metadata?: Record<string, any>;
}
