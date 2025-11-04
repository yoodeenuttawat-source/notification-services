import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { KafkaService } from '../../kafka/kafka.service';
import { ConfigService } from '../../cache/config.service';
import { ProviderFactoryService } from '../../providers/provider-factory.service';
import { KAFKA_TOPICS } from '../../kafka/kafka.config';
import { ChannelMessage } from '../../kafka/types/channel-message';
import { DeliveryLog } from '../../kafka/types/delivery-log';
import { CircuitBreakerOpenError } from '../../circuit-breaker/CircuitBreakerOpenError';
import { DLQMessage } from '../../kafka/types/dlq-message';
import { ErrorClassifier } from '../../kafka/utils/error-classifier';
import { EachMessagePayload } from 'kafkajs';
import { CacheService } from '../../cache/cache.service';

@Injectable()
export class PushWorkerService implements OnModuleInit {
  private readonly logger = new Logger(PushWorkerService.name);
  private readonly DEDUP_TTL_SECONDS = 120; // 2 minutes

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly configService: ConfigService,
    private readonly providerFactory: ProviderFactoryService,
    private readonly cacheService: CacheService
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing push worker...');
    
    this.logger.log(`Creating consumer for group: push-worker-group, topics: ${KAFKA_TOPICS.PUSH_NOTIFICATION}`);
    const consumer = await this.kafkaService.createConsumer(
      'push-worker-group',
      [KAFKA_TOPICS.PUSH_NOTIFICATION]
    );

    this.logger.log('Starting to consume messages from push notification topic...');
    await this.kafkaService.consumeMessages(consumer, async (payload) => {
      await this.processPushNotification(payload);
    });

    this.logger.log('Push worker started and ready to process messages');
  }

  private async processPushNotification(payload: EachMessagePayload) {
    const originalMessage = payload.message.value.toString();
    
    try {
      // Parse and validate message
      const message = await this.parseMessage(originalMessage);
      if (!message) return;

      // Check for duplicate message
      if (this.isDuplicate(message.notification_id)) {
        this.logger.warn(`Duplicate push notification detected, skipping: ${message.notification_id}`);
        return; // Skip processing duplicate message
      }

      // Mark as processed to prevent duplicates
      this.markAsProcessed(message.notification_id);

      // Get providers and validate
      const providers = await this.getProviders(message.channel_id);
      if (!providers || providers.length === 0) {
        await this.handleNoProviders(message, originalMessage, payload.message.key?.toString());
        return;
      }

      // Try to send notification via providers
      const result = await this.trySendNotification(message, providers);
      
      // Handle failure if all providers failed
      if (!result.success) {
        await this.handleAllProvidersFailed(
          originalMessage,
          payload.message.key?.toString(),
          message,
          result.error
        );
      }
    } catch (error) {
      this.logger.error('Unexpected error in push notification processing:', error);
      await this.handleProcessingError(
        originalMessage,
        payload.message.key?.toString(),
        error
      );
    }
  }

  private async parseMessage(originalMessage: string): Promise<ChannelMessage | null> {
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
        channel_name: 'PUSH',
        stage: 'processing_failed',
        status: 'failed',
        error_message: `Invalid JSON message format: ${parseErr.message}`,
      });
      return null;
    }
  }

  private async getProviders(channelId: number) {
    try {
      return await this.configService.getProvidersByChannel(channelId);
    } catch (error) {
      this.logger.error(`Error getting providers for channel_id ${channelId}:`, error);
      return null;
    }
  }

  private async handleNoProviders(message: ChannelMessage, originalMessage: string, originalKey: string): Promise<void> {
    this.logger.warn(`No providers found for channel_id: ${message.channel_id}`);
    await this.publishDeliveryLog({
      notification_id: message.notification_id,
      event_id: message.event_id,
      event_name: message.event_name,
      channel_id: message.channel_id,
      channel_name: message.channel_name,
      stage: 'provider_called',
      status: 'failed',
      error_message: 'No providers available - configuration issue',
    });
    await this.sendToDLQ(
        originalMessage,
        KAFKA_TOPICS.PUSH_NOTIFICATION,
        originalKey,
        Error('No providers available - configuration issue'),
        message.notification_id
    );
  }

  private async trySendNotification(
    message: ChannelMessage,
    providers: Array<{ name: string; priority: number }>
  ): Promise<{ success: boolean; error: Error | null }> {
    this.logger.log(`Processing push notification: ${message.notification_id}`);

    for (const providerConfig of providers) {
      const provider = this.providerFactory.getProvider(providerConfig.name);
      if (!provider) {
        this.logger.warn(`Provider ${providerConfig.name} not found in factory`);
        continue;
      }

      try {
        await provider.sendNotification({
          recipient: message.recipient,
          subject: message.template_subject,
          content: message.template_content,
          metadata: message.metadata,
          context: {
            notification_id: message.notification_id,
            event_id: message.event_id,
            event_name: message.event_name,
            channel_id: message.channel_id,
            channel_name: message.channel_name,
          }
        });

        this.logger.log(
          `Push notification ${message.notification_id} sent via ${providerConfig.name}`
        );
        return { success: true, error: null };
      } catch (providerError) {
        // Continue to next provider
        continue;
      }
    }

    return { success: false, error: new Error('All providers failed') };
  }

  private async handleAllProvidersFailed(
    originalMessage: string,
    originalKey: string | undefined,
    message: ChannelMessage,
    error: Error | null
  ): Promise<void> {
    this.logger.error(
      `All push providers failed for notification ${message.notification_id}:`,
      error
    );

    await this.publishDeliveryLog({
      notification_id: message.notification_id,
      event_id: message.event_id,
      event_name: message.event_name,
      channel_id: message.channel_id,
      channel_name: message.channel_name,
      stage: 'provider_failed',
      status: 'failed',
      error_message: error?.message || 'Non-retriable error: All providers failed',
    });
    await this.sendToDLQ(
        originalMessage,
        KAFKA_TOPICS.PUSH_NOTIFICATION,
        originalKey,
        error,
        message.notification_id
    );
  }

  private async handleProcessingError(
    originalMessage: string,
    originalKey: string | undefined,
    error: unknown
  ): Promise<void> {
    this.logger.error('Error processing push notification:', error);
    
    const errorObj = error instanceof Error ? error : new Error(String(error));

    await this.publishDeliveryLog({
      notification_id: 'unknown',
      event_id: 0,
      event_name: 'unknown',
      channel_id: 0,
      channel_name: 'PUSH',
      stage: 'processing_failed',
      status: 'failed',
      error_message: errorObj.message
    });
  }

  private async publishDeliveryLog(log: Omit<DeliveryLog, 'timestamp'>) {
    const deliveryLog: DeliveryLog = {
      ...log,
      timestamp: new Date().toISOString()
    };

    await this.kafkaService.publishMessage(KAFKA_TOPICS.DELIVERY_LOGS, [
      {
        key: log.notification_id,
        value: deliveryLog
      }
    ]);
  }

  private async sendToDLQ(
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
          type: errorObj.constructor.name
        },
        retryCount: 0,
        maxRetries: 0,
        timestamp: new Date().toISOString(),
        metadata: {
          notification_id: notificationId,
          channel_name: 'PUSH'
        }
      };

      await this.kafkaService.publishMessage(KAFKA_TOPICS.PUSH_NOTIFICATION_DLQ, [
        {
          key: notificationId || originalKey,
          value: dlqMessage
        }
      ]);

      this.logger.warn(`Sent message to DLQ: ${KAFKA_TOPICS.PUSH_NOTIFICATION_DLQ}, notification_id: ${notificationId}`);
    } catch (dlqError) {
      this.logger.error('Failed to send message to DLQ:', dlqError);
      // Don't throw - we don't want DLQ failures to crash the worker
    }
  }

  /**
   * Check if notification has been processed recently (deduplication)
   */
  private isDuplicate(notificationId: string): boolean {
    const cacheKey = `dedup:push:${notificationId}`;
    const cached = this.cacheService.get<boolean>(cacheKey);
    return cached === true;
  }

  /**
   * Mark notification as processed to prevent duplicates
   */
  private markAsProcessed(notificationId: string): void {
    const cacheKey = `dedup:push:${notificationId}`;
    this.cacheService.set(cacheKey, true, this.DEDUP_TTL_SECONDS);
  }
}
