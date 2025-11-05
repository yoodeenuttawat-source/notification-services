import { Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaService } from '../../kafka/kafka.service';
import { KAFKA_TOPICS } from '../../kafka/kafka.config';
import { NotificationMessage } from '../../kafka/types/notification-message';
import { ChannelMessage } from '../../kafka/types/channel-message';
import { BaseWorkerService } from '../base-worker.service';
import { CacheService } from '../../cache/cache.service';
import { MetricsService } from '../../metrics/metrics.service';
import { EachMessagePayload } from 'kafkajs';

@Injectable()
export class SplitterWorkerService extends BaseWorkerService implements OnModuleInit {
  private readonly workerName = 'splitter-worker';
  private readonly topic = KAFKA_TOPICS.NOTIFICATION;

  constructor(
    protected readonly kafkaService: KafkaService,
    protected readonly cacheService: CacheService,
    protected readonly metricsService: MetricsService
  ) {
    super(kafkaService, cacheService, SplitterWorkerService.name, metricsService);
  }

  protected getDedupKeyPrefix(): string {
    return 'dedup:notification:';
  }

  protected getDefaultChannelName(): string {
    return 'unknown';
  }

  protected getDLQTopic(): string {
    return KAFKA_TOPICS.NOTIFICATION_DLQ;
  }

  protected getDLQMetadata(notificationId?: string): Record<string, any> {
    return {
      notification_id: notificationId,
    };
  }

  async onModuleInit() {
    this.logger.log('Initializing splitter worker...');

    this.logger.log(
      `Creating consumer for group: splitter-worker-group, topics: ${KAFKA_TOPICS.NOTIFICATION}`
    );
    const consumer = await this.kafkaService.createConsumer('splitter-worker-group', [
      KAFKA_TOPICS.NOTIFICATION,
    ]);

    this.logger.log('Starting to consume messages from notification topic...');
    await this.kafkaService.consumeMessages(
      consumer,
      async (payload) => {
        await this.processNotification(payload);
      },
      KAFKA_TOPICS.NOTIFICATION,
      'splitter-worker-group'
    );

    this.logger.log('Splitter worker started and ready to process messages');
  }

  private async processNotification(payload: EachMessagePayload) {
    const originalMessage = payload.message.value.toString();
    const startTime = process.hrtime.bigint();
    let status = 'success';

    try {
      // Parse and validate message
      const message = await this.parseMessage<NotificationMessage>(originalMessage);
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
        this.logger.warn(`Duplicate notification detected, skipping: ${message.notification_id}`);
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

      // Validate message has templates
      if (!(await this.validateMessage(message))) {
        status = 'failure';
        const duration = Number(process.hrtime.bigint() - startTime) / 1e9;
        this.metricsService.workerProcessingMetrics.observe(
          { worker: this.workerName, topic: this.topic, status },
          duration
        );
        return;
      }

      // Route each rendered template to its channel topic concurrently
      await this.routeTemplates(message);

      // Record success
      status = 'success';
      const duration = Number(process.hrtime.bigint() - startTime) / 1e9;
      this.metricsService.workerProcessingMetrics.observe(
        { worker: this.workerName, topic: this.topic, status },
        duration
      );
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

  private async validateMessage(message: NotificationMessage): Promise<boolean> {
    if (!message.rendered_templates || message.rendered_templates.length === 0) {
      // No templates is non-retriable (invalid data) - commit and log
      this.logger.warn(`No rendered templates found for notification: ${message.notification_id}`);
      await this.publishDeliveryLog({
        notification_id: message.notification_id,
        event_id: message.event_id,
        event_name: message.event_name,
        channel_id: 0,
        channel_name: 'unknown',
        stage: 'processing_failed',
        status: 'failed',
        error_message: 'No rendered templates found - invalid message data',
      });
      return false; // Commit message, no DLQ
    }
    return true;
  }

  private async routeTemplates(message: NotificationMessage): Promise<void> {
    this.logger.log(`Processing notification: ${message.notification_id}`);

    try {
      await Promise.all(
        message.rendered_templates.map((renderedTemplate) =>
          this.routeToChannel(message, renderedTemplate)
        )
      );
    } catch (routeError) {
      const errorObj = routeError instanceof Error ? routeError : new Error(String(routeError));
      this.logger.error('Error routing templates:', errorObj);

      await this.publishDeliveryLog({
        notification_id: message.notification_id,
        event_id: message.event_id,
        event_name: message.event_name,
        channel_id: 0,
        channel_name: 'unknown',
        stage: 'processing_failed',
        status: 'failed',
        error_message: errorObj.message,
      });

      // Always send to DLQ on routing errors (they are retriable)
      await this.sendToDLQ(
        JSON.stringify(message),
        KAFKA_TOPICS.NOTIFICATION,
        message.notification_id,
        errorObj,
        message.notification_id
      );
    }
  }

  private async routeToChannel(
    notification: NotificationMessage,
    renderedTemplate: (typeof notification.rendered_templates)[0]
  ): Promise<void> {
    try {
      // Create channel message from pre-rendered template
      const channelMessage = this.createChannelMessage(notification, renderedTemplate);

      // Route to appropriate channel topic
      const topic = this.getChannelTopic(renderedTemplate.channel_name);
      await this.kafkaService.publishMessage(topic, [
        {
          key: notification.notification_id,
          value: channelMessage,
        },
      ]);

      // Publish delivery log
      await this.publishDeliveryLog({
        notification_id: notification.notification_id,
        event_id: notification.event_id,
        event_name: notification.event_name,
        channel_id: renderedTemplate.channel_id,
        channel_name: renderedTemplate.channel_name,
        stage: 'routed',
        status: 'pending',
      });

      this.logger.log(
        `Routed notification ${notification.notification_id} to ${renderedTemplate.channel_name} channel`
      );
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Error routing to channel ${renderedTemplate.channel_name}:`, errorObj);

      // Publish failure log
      await this.publishDeliveryLog({
        notification_id: notification.notification_id,
        event_id: notification.event_id,
        event_name: notification.event_name,
        channel_id: renderedTemplate.channel_id,
        channel_name: renderedTemplate.channel_name,
        stage: 'routed',
        status: 'failed',
        error_message: errorObj.message,
      });

      throw errorObj; // Re-throw to be caught by routeTemplates
    }
  }

  private createChannelMessage(
    notification: NotificationMessage,
    renderedTemplate: (typeof notification.rendered_templates)[0]
  ): ChannelMessage {
    return {
      notification_id: notification.notification_id,
      event_id: notification.event_id,
      event_name: notification.event_name,
      channel_id: renderedTemplate.channel_id,
      channel_name: renderedTemplate.channel_name,
      template_id: renderedTemplate.template_id,
      template_name: renderedTemplate.template_name,
      template_subject: renderedTemplate.subject,
      template_content: renderedTemplate.content,
      recipient: renderedTemplate.recipient,
      variables: notification.data,
      metadata: notification.metadata,
    };
  }

  private getChannelTopic(channelName: string): string {
    switch (channelName.toLowerCase()) {
      case 'push':
        return KAFKA_TOPICS.PUSH_NOTIFICATION;
      case 'email':
        return KAFKA_TOPICS.EMAIL_NOTIFICATION;
      default:
        throw new Error(`Unknown channel: ${channelName}`);
    }
  }
}
