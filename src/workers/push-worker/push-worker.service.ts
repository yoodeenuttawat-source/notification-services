import { Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaService } from '../../kafka/kafka.service';
import { ConfigService } from '../../cache/config.service';
import { ProviderFactoryService } from '../../providers/provider-factory.service';
import { KAFKA_TOPICS } from '../../kafka/kafka.config';
import { ChannelMessage } from '../../kafka/types/channel-message';
import { ChannelWorkerBaseService } from '../channel-worker-base.service';
import { CacheService } from '../../cache/cache.service';
import { MetricsService } from '../../metrics/metrics.service';
import { EachMessagePayload } from 'kafkajs';

@Injectable()
export class PushWorkerService extends ChannelWorkerBaseService implements OnModuleInit {
  private readonly workerName = 'push-worker';
  private readonly topic = KAFKA_TOPICS.PUSH_NOTIFICATION;

  constructor(
    protected readonly kafkaService: KafkaService,
    protected readonly cacheService: CacheService,
    protected readonly configService: ConfigService,
    protected readonly providerFactory: ProviderFactoryService,
    protected readonly metricsService: MetricsService
  ) {
    super(kafkaService, cacheService, configService, providerFactory, PushWorkerService.name, metricsService);
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
    await this.kafkaService.consumeMessages(
      consumer,
      async (payload) => {
        await this.processPushNotification(payload);
      },
      KAFKA_TOPICS.PUSH_NOTIFICATION,
      'push-worker-group'
    );

    this.logger.log('Push worker started and ready to process messages');
  }

  private async processPushNotification(payload: EachMessagePayload) {
    const originalMessage = payload.message.value.toString();
    const startTime = process.hrtime.bigint();
    let status = 'success';

    try {
      // Parse and validate message
      const message = await this.parseMessage<ChannelMessage>(originalMessage);
      if (!message) {
        status = 'failure';
        const duration = Number(process.hrtime.bigint() - startTime) / 1e9;
        this.metricsService.workerProcessingMetrics.observe(
          { worker: this.workerName, topic: this.topic, status },
          duration
        );
        return;
      }

      // Check for duplicate message
      if (await this.isDuplicate(message.notification_id)) {
        this.logger.warn(
          `Duplicate push notification detected, skipping: ${message.notification_id}`
        );
        status = 'success'; // Duplicate is considered successful (idempotent)
        const duration = Number(process.hrtime.bigint() - startTime) / 1e9;
        this.metricsService.workerProcessingMetrics.observe(
          { worker: this.workerName, topic: this.topic, status },
          duration
        );
        return; // Skip processing duplicate message
      }

      // Mark as processed to prevent duplicates
      await this.markAsProcessed(message.notification_id);

      // Get providers and validate
      const providers = await this.getProviders(message.channel_id);
      if (!providers || providers.length === 0) {
        status = 'failure';
        const duration = Number(process.hrtime.bigint() - startTime) / 1e9;
        this.metricsService.workerProcessingMetrics.observe(
          { worker: this.workerName, topic: this.topic, status },
          duration
        );
        await this.handleNoProviders(message, originalMessage, payload.message.key?.toString());
        return;
      }

      // Try to send notification via providers
      const result = await this.trySendNotification(message, providers, 'Push');

      // Handle failure if all providers failed
      if (!result.success) {
        status = 'failure';
        const duration = Number(process.hrtime.bigint() - startTime) / 1e9;
        this.metricsService.workerProcessingMetrics.observe(
          { worker: this.workerName, topic: this.topic, status },
          duration
        );
        await this.handleAllProvidersFailed(
          originalMessage,
          payload.message.key?.toString(),
          message,
          result.error,
          'Push'
        );
      } else {
        status = 'success';
        const duration = Number(process.hrtime.bigint() - startTime) / 1e9;
        this.metricsService.workerProcessingMetrics.observe(
          { worker: this.workerName, topic: this.topic, status },
          duration
        );
      }
    } catch (error) {
      status = 'failure';
      const duration = Number(process.hrtime.bigint() - startTime) / 1e9;
      this.metricsService.workerProcessingMetrics.observe(
        { worker: this.workerName, topic: this.topic, status },
        duration
      );
      await this.handleProcessingError(
        originalMessage,
        payload.message.key?.toString(),
        error,
        KAFKA_TOPICS.NOTIFICATION
      );
    }
  }
}
