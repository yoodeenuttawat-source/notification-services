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
};
