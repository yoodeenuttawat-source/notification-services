import { Logger } from '@nestjs/common';
import { KafkaService } from '../kafka/kafka.service';
import { CacheService } from '../cache/cache.service';
import { KAFKA_TOPICS } from '../kafka/kafka.config';
import { DeliveryLog } from '../kafka/types/delivery-log';
import { DLQMessage } from '../kafka/types/dlq-message';
import { MetricsService } from '../metrics/metrics.service';

export abstract class BaseWorkerService {
  protected readonly logger: Logger;
  protected readonly DEDUP_TTL_SECONDS = 120; // 2 minutes

  constructor(
    protected kafkaService: KafkaService,
    protected cacheService: CacheService,
    protected loggerName: string,
    protected metricsService: MetricsService
  ) {
    this.logger = new Logger(loggerName);
  }

  /**
   * Get the deduplication cache key prefix for this worker
   */
  protected abstract getDedupKeyPrefix(): string;

  /**
   * Get the default channel name for error logging (used when channel is unknown)
   */
  protected abstract getDefaultChannelName(): string;

  /**
   * Get the DLQ topic for this worker
   */
  protected abstract getDLQTopic(): string;

  /**
   * Get metadata for DLQ messages
   * Can be overridden to add channel-specific metadata
   */
  protected getDLQMetadata(notificationId?: string): Record<string, any> {
    return {
      notification_id: notificationId,
      channel_name: this.getDefaultChannelName(),
    };
  }

  /**
   * Parse message from string
   */
  protected async parseMessage<T>(originalMessage: string): Promise<T | null> {
    try {
      return JSON.parse(originalMessage);
    } catch (parseError) {
      const parseErr = parseError instanceof Error ? parseError : new Error(String(parseError));
      this.logger.error('JSON parse error (non-retriable):', parseErr);

      await this.publishDeliveryLog({
        notification_id: 'unknown',
        event_id: 0,
        event_name: 'unknown',
        channel_id: 0,
        channel_name: this.getDefaultChannelName(),
        stage: 'processing_failed',
        status: 'failed',
        error_message: `Invalid JSON message format: ${parseErr.message}`,
      });
      return null;
    }
  }

  /**
   * Publish delivery log to Kafka
   */
  protected async publishDeliveryLog(log: Omit<DeliveryLog, 'timestamp'>): Promise<void> {
    const deliveryLog: DeliveryLog = {
      ...log,
      timestamp: new Date().toISOString(),
    };

    await this.kafkaService.publishMessage(KAFKA_TOPICS.DELIVERY_LOGS, [
      {
        key: log.notification_id,
        value: deliveryLog,
      },
    ]);
  }

  /**
   * Send message to Dead Letter Queue
   */
  protected async sendToDLQ(
    originalMessage: string,
    originalTopic: string,
    originalKey: string | undefined,
    error: unknown,
    notificationId?: string
  ): Promise<void> {
    try {
      const errorObj = error instanceof Error ? error : new Error(String(error));

      const dlqMessage: DLQMessage = {
        originalMessage: JSON.parse(originalMessage),
        originalTopic,
        originalKey,
        error: {
          message: errorObj.message,
          stack: errorObj.stack,
          type: errorObj.constructor.name,
        },
        retryCount: 0,
        maxRetries: 0,
        timestamp: new Date().toISOString(),
        metadata: this.getDLQMetadata(notificationId),
      };

      const dlqTopic = this.getDLQTopic();
      await this.kafkaService.publishMessage(dlqTopic, [
        {
          key: notificationId || originalKey,
          value: dlqMessage,
        },
      ]);

      this.logger.warn(`Sent message to DLQ: ${dlqTopic}, notification_id: ${notificationId}`);
    } catch (dlqError) {
      this.logger.error('Failed to send message to DLQ:', dlqError);
      // Don't throw - we don't want DLQ failures to crash the worker
    }
  }

  /**
   * Handle processing errors
   */
  protected async handleProcessingError(
    originalMessage: string,
    originalKey: string | undefined,
    error: unknown,
    errorTopic?: string
  ): Promise<void> {
    this.logger.error('Error processing notification:', error);

    const errorObj = error instanceof Error ? error : new Error(String(error));
    let notificationId: string | undefined;

    try {
      const parsed = JSON.parse(originalMessage);
      notificationId = parsed.notification_id;
    } catch {
      // Ignore parse errors, we'll use 'unknown'
    }

    // Always send to DLQ for processing errors (they are retriable)
    await this.sendToDLQ(
      originalMessage,
      errorTopic || this.getDLQTopic(),
      originalKey,
      errorObj,
      notificationId
    );
  }

  /**
   * Check if notification has been processed recently (deduplication)
   */
  protected async isDuplicate(notificationId: string): Promise<boolean> {
    const cacheKey = `${this.getDedupKeyPrefix()}${notificationId}`;
    const cached = await this.cacheService.get<boolean>(cacheKey);
    return cached === true;
  }

  /**
   * Mark notification as processed to prevent duplicates
   */
  protected async markAsProcessed(notificationId: string): Promise<void> {
    const cacheKey = `${this.getDedupKeyPrefix()}${notificationId}`;
    await this.cacheService.set(cacheKey, true, this.DEDUP_TTL_SECONDS);
  }

  /**
   * Extract notification ID from message string
   */
  protected extractNotificationId(originalMessage: string): string | undefined {
    try {
      const parsed = JSON.parse(originalMessage);
      return parsed.notification_id;
    } catch {
      return undefined;
    }
  }
}
