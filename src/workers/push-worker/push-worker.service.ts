import { Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaService } from '../../kafka/kafka.service';
import { ConfigService } from '../../cache/config.service';
import { ProviderFactoryService } from '../../providers/provider-factory.service';
import { KAFKA_TOPICS } from '../../kafka/kafka.config';
import { ChannelMessage } from '../../kafka/types/channel-message';
import { ChannelWorkerBaseService } from '../channel-worker-base.service';
import { CacheService } from '../../cache/cache.service';
import { EachMessagePayload } from 'kafkajs';

@Injectable()
export class PushWorkerService extends ChannelWorkerBaseService implements OnModuleInit {
  constructor(
    protected readonly kafkaService: KafkaService,
    protected readonly cacheService: CacheService,
    protected readonly configService: ConfigService,
    protected readonly providerFactory: ProviderFactoryService
  ) {
    super(kafkaService, cacheService, configService, providerFactory, PushWorkerService.name);
  }

  protected getDedupKeyPrefix(): string {
    return 'dedup:push:';
  }

  protected getDefaultChannelName(): string {
    return 'PUSH';
  }

  protected getDLQTopic(): string {
    return KAFKA_TOPICS.PUSH_NOTIFICATION_DLQ;
  }

  protected getChannelTopic(): string {
    return KAFKA_TOPICS.PUSH_NOTIFICATION;
  }

  async onModuleInit() {
    this.logger.log('Initializing push worker...');

    this.logger.log(
      `Creating consumer for group: push-worker-group, topics: ${KAFKA_TOPICS.PUSH_NOTIFICATION}`
    );
    const consumer = await this.kafkaService.createConsumer('push-worker-group', [
      KAFKA_TOPICS.PUSH_NOTIFICATION,
    ]);

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
      const message = await this.parseMessage<ChannelMessage>(originalMessage);
      if (!message) return;

      // Check for duplicate message
      if (this.isDuplicate(message.notification_id)) {
        this.logger.warn(
          `Duplicate push notification detected, skipping: ${message.notification_id}`
        );
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
      const result = await this.trySendNotification(message, providers, 'Push');

      // Handle failure if all providers failed
      if (!result.success) {
        await this.handleAllProvidersFailed(
          originalMessage,
          payload.message.key?.toString(),
          message,
          result.error,
          'Push'
        );
      }
    } catch (error) {
      await this.handleProcessingError(
        originalMessage,
        payload.message.key?.toString(),
        error,
        KAFKA_TOPICS.NOTIFICATION
      );
    }
  }
}
