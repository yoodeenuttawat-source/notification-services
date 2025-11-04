import { getKafkaConfig, KAFKA_TOPICS } from './kafka.config';

describe('kafka.config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getKafkaConfig', () => {
    it('should return default config when env vars not set', () => {
      delete process.env.KAFKA_BROKERS;
      delete process.env.KAFKA_CLIENT_ID;
      delete process.env.KAFKA_GROUP_ID;
      delete process.env.KAFKA_RETRIES;
      delete process.env.KAFKA_INITIAL_RETRY_TIME;

      const config = getKafkaConfig();

      expect(config).toEqual({
        brokers: ['localhost:29092'],
        clientId: 'notification-service',
        groupId: 'notification-service-group',
        retry: {
          retries: 8,
          initialRetryTime: 100,
        },
      });
    });

    it('should use environment variables when set', () => {
      process.env.KAFKA_BROKERS = 'broker1:9092,broker2:9092';
      process.env.KAFKA_CLIENT_ID = 'test-client';
      process.env.KAFKA_GROUP_ID = 'test-group';
      process.env.KAFKA_RETRIES = '5';
      process.env.KAFKA_INITIAL_RETRY_TIME = '200';

      const config = getKafkaConfig();

      expect(config).toEqual({
        brokers: ['broker1:9092', 'broker2:9092'],
        clientId: 'test-client',
        groupId: 'test-group',
        retry: {
          retries: 5,
          initialRetryTime: 200,
        },
      });
    });

    it('should parse comma-separated brokers', () => {
      process.env.KAFKA_BROKERS = 'host1:9092,host2:9092,host3:9092';

      const config = getKafkaConfig();

      expect(config.brokers).toEqual(['host1:9092', 'host2:9092', 'host3:9092']);
    });

    it('should handle single broker', () => {
      process.env.KAFKA_BROKERS = 'single-broker:9092';

      const config = getKafkaConfig();

      expect(config.brokers).toEqual(['single-broker:9092']);
    });
  });

  describe('KAFKA_TOPICS', () => {
    it('should have all required topics', () => {
      expect(KAFKA_TOPICS.NOTIFICATION).toBe('notification');
      expect(KAFKA_TOPICS.PUSH_NOTIFICATION).toBe('notification.push');
      expect(KAFKA_TOPICS.EMAIL_NOTIFICATION).toBe('notification.email');
      expect(KAFKA_TOPICS.DELIVERY_LOGS).toBe('delivery_logs');
      expect(KAFKA_TOPICS.PROVIDER_REQUEST_RESPONSE).toBe('provider_request_response');
      expect(KAFKA_TOPICS.NOTIFICATION_DLQ).toBe('notification.dlq');
      expect(KAFKA_TOPICS.PUSH_NOTIFICATION_DLQ).toBe('notification.push.dlq');
      expect(KAFKA_TOPICS.EMAIL_NOTIFICATION_DLQ).toBe('notification.email.dlq');
    });
  });
});

