export interface KafkaConfig {
  brokers: string[];
  clientId: string;
  groupId: string;
  retry?: {
    retries: number;
    initialRetryTime: number;
  };
}

export const getKafkaConfig = (): KafkaConfig => {
  const brokers = process.env.KAFKA_BROKERS?.split(',') || ['localhost:29092'];
  
  return {
    brokers,
    clientId: process.env.KAFKA_CLIENT_ID || 'notification-service',
    groupId: process.env.KAFKA_GROUP_ID || 'notification-service-group',
    retry: {
      retries: parseInt(process.env.KAFKA_RETRIES || '8', 10),
      initialRetryTime: parseInt(process.env.KAFKA_INITIAL_RETRY_TIME || '100', 10)
    }
  };
};

export const KAFKA_TOPICS = {
  NOTIFICATION: 'notification',
  PUSH_NOTIFICATION: 'notification.push',
  EMAIL_NOTIFICATION: 'notification.email',
  DELIVERY_LOGS: 'delivery_logs',
  PROVIDER_REQUEST_RESPONSE: 'provider_request_response',
  // Dead Letter Queues
  NOTIFICATION_DLQ: 'notification.dlq',
  PUSH_NOTIFICATION_DLQ: 'notification.push.dlq',
  EMAIL_NOTIFICATION_DLQ: 'notification.email.dlq'
} as const;
