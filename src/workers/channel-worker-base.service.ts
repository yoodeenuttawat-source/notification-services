import { Inject } from '@nestjs/common';
import { ConfigService } from '../cache/config.service';
import { ProviderFactoryService } from '../providers/provider-factory.service';
import { KAFKA_TOPICS } from '../kafka/kafka.config';
import { ChannelMessage } from '../kafka/types/channel-message';
import { BaseWorkerService } from './base-worker.service';
import { KafkaService } from '../kafka/kafka.service';
import { CacheService } from '../cache/cache.service';
import { MetricsService } from '../metrics/metrics.service';

/**
 * Base class for channel-specific workers (email, push)
 * Provides common functionality for provider-based workers
 */
export abstract class ChannelWorkerBaseService extends BaseWorkerService {
  constructor(
    kafkaService: KafkaService,
    cacheService: CacheService,
    protected readonly configService: ConfigService,
    protected readonly providerFactory: ProviderFactoryService,
    loggerName: string,
    metricsService: MetricsService
  ) {
    super(kafkaService, cacheService, loggerName, metricsService);
  }

  /**
   * Get providers for a channel
   */
  protected async getProviders(channelId: number): Promise<Array<{
    name: string;
    priority: number;
    provider_id: number;
    channel_id: number;
  }> | null> {
    try {
      return await this.configService.getProvidersByChannel(channelId);
    } catch (error) {
      this.logger.error(`Error getting providers for channel_id ${channelId}:`, error);
      return null;
    }
  }

  /**
   * Handle case when no providers are available
   */
  protected async handleNoProviders(
    message: ChannelMessage,
    originalMessage: string,
    originalKey: string
  ): Promise<void> {
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
      this.getChannelTopic(),
      originalKey,
      Error('No providers available - configuration issue'),
      message.notification_id
    );
  }

  /**
   * Try to send notification via providers
   */
  protected async trySendNotification(
    message: ChannelMessage,
    providers: Array<{ name: string; priority: number }>,
    logPrefix: string
  ): Promise<{ success: boolean; error: Error | null }> {
    this.logger.log(`Processing ${logPrefix} notification: ${message.notification_id}`);

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
          },
        });

        this.logger.log(
          `${logPrefix} notification ${message.notification_id} sent via ${providerConfig.name}`
        );
        return { success: true, error: null };
      } catch (providerError) {
        // Continue to next provider
        continue;
      }
    }

    return { success: false, error: new Error('All providers failed') };
  }

  /**
   * Handle case when all providers failed
   */
  protected async handleAllProvidersFailed(
    originalMessage: string,
    originalKey: string | undefined,
    message: ChannelMessage,
    error: Error | null,
    logPrefix: string
  ): Promise<void> {
    this.logger.error(
      `All ${logPrefix.toLowerCase()} providers failed for notification ${message.notification_id}:`,
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
      this.getChannelTopic(),
      originalKey,
      error,
      message.notification_id
    );
  }

  /**
   * Get the channel topic for this worker
   */
  protected abstract getChannelTopic(): string;
}
