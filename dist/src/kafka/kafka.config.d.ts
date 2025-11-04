export interface KafkaConfig {
    brokers: string[];
    clientId: string;
    groupId: string;
    retry?: {
        retries: number;
        initialRetryTime: number;
    };
}
export declare const getKafkaConfig: () => KafkaConfig;
export declare const KAFKA_TOPICS: {
    readonly NOTIFICATION: "notification";
    readonly PUSH_NOTIFICATION: "notification.push";
    readonly EMAIL_NOTIFICATION: "notification.email";
    readonly DELIVERY_LOGS: "delivery_logs";
    readonly PROVIDER_REQUEST_RESPONSE: "provider_request_response";
    readonly NOTIFICATION_DLQ: "notification.dlq";
    readonly PUSH_NOTIFICATION_DLQ: "notification.push.dlq";
    readonly EMAIL_NOTIFICATION_DLQ: "notification.email.dlq";
};
