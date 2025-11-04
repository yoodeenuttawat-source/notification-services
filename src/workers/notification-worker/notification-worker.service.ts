import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { KafkaService } from '../../kafka/kafka.service';
import { KAFKA_TOPICS } from '../../kafka/kafka.config';
import { NotificationMessage } from '../../kafka/types/notification-message';
import { ChannelMessage } from '../../kafka/types/channel-message';
import { DeliveryLog } from '../../kafka/types/delivery-log';
import { DLQMessage } from '../../kafka/types/dlq-message';
import { ErrorClassifier } from '../../kafka/utils/error-classifier';
import { CacheService } from '../../cache/cache.service';

@Injectable()
export class NotificationWorkerService implements OnModuleInit {
  private readonly logger = new Logger(NotificationWorkerService.name);
  private readonly DEDUP_TTL_SECONDS = 120; // 2 minutes

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly cacheService: CacheService
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing notification worker...');
    
    this.logger.log(`Creating consumer for group: notification-worker-group, topics: ${KAFKA_TOPICS.NOTIFICATION}`);
    const consumer = await this.kafkaService.createConsumer(
      'notification-worker-group',
      [KAFKA_TOPICS.NOTIFICATION]
    );

    this.logger.log('Starting to consume messages from notification topic...');
    await this.kafkaService.consumeMessages(consumer, async (payload) => {
      await this.processNotification(payload);
    });

    this.logger.log('Notification worker started and ready to process messages');
  }

  private async processNotification(payload: any) {
    const originalMessage = payload.message.value.toString();
    let message: NotificationMessage;
    

    try {
      try {
        message = JSON.parse(originalMessage);
      } catch (parseError) {
        // JSON parse error is non-retriable - commit message and log failure
        const parseErr = parseError instanceof Error ? parseError : new Error(String(parseError));
        this.logger.error('JSON parse error (non-retriable):', parseErr);
        
        await this.publishDeliveryLog({
          notification_id: 'unknown',
          event_id: 0,
          event_name: 'unknown',
          channel_id: 0,
          channel_name: 'unknown',
          stage: 'processing_failed',
          status: 'failed',
          error_message: `Invalid JSON message format: ${parseErr.message}`,
        });
        // Message will be committed (acknowledged) - no DLQ for non-retriable errors
        return;
      }

      // Check for duplicate message
      if (this.isDuplicate(message.notification_id)) {
        this.logger.warn(`Duplicate notification detected, skipping: ${message.notification_id}`);
        return; // Skip processing duplicate message
      }

      // Mark as processed to prevent duplicates
      this.markAsProcessed(message.notification_id);

      this.logger.log(`Processing notification: ${message.notification_id}`);

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
        return; // Commit message, no DLQ
      }

      // Route each rendered template to its channel topic concurrently
      try {
        await Promise.all(
          message.rendered_templates.map(renderedTemplate =>
            this.routeToChannel(message, renderedTemplate)
          )
        );
      } catch (routeError) {
        // Check if error is retriable
        const errorObj = routeError instanceof Error ? routeError : new Error(String(routeError));
        if (ErrorClassifier.isRetriable(errorObj)) {
          // Retriable error - send to DLQ
          await this.sendToDLQ(
            originalMessage,
            KAFKA_TOPICS.NOTIFICATION,
            payload.message.key?.toString(),
            errorObj,
            message.notification_id
          );
        } else {
          // Non-retriable error - commit and log (no DLQ)
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
          // Message will be committed (acknowledged)
        }
      }
    } catch (error) {
      this.logger.error('Error processing notification:', error);
      
      const errorObj = error instanceof Error ? error : new Error(String(error));
      
      // Check if error is retriable
      if (ErrorClassifier.isRetriable(errorObj)) {
        // Retriable error - send to DLQ for replay
        await this.sendToDLQ(
          originalMessage,
          KAFKA_TOPICS.NOTIFICATION,
          payload.message.key?.toString(),
          errorObj,
          message?.notification_id
        );
      } else {
        // Non-retriable error - commit message and log failure (no DLQ)
        await this.publishDeliveryLog({
          notification_id: message?.notification_id || 'unknown',
          event_id: message?.event_id || 0,
          event_name: message?.event_name || 'unknown',
          channel_id: 0,
          channel_name: 'unknown',
          stage: 'processing_failed',
          status: 'failed',
          error_message: errorObj.message,
        });
        // Message will be committed (acknowledged) - no DLQ
      }
    }
  }

  private async routeToChannel(
    notification: NotificationMessage,
    renderedTemplate: typeof notification.rendered_templates[0]
  ) {
    try {
      // Create channel message from pre-rendered template
      const channelMessage: ChannelMessage = {
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
        metadata: notification.metadata
      };

      // Route to appropriate channel topic
      const topic = this.getChannelTopic(renderedTemplate.channel_name);
      await this.kafkaService.publishMessage(topic, [
        {
          key: notification.notification_id,
          value: channelMessage
        }
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
      this.logger.error(`Error routing to channel ${renderedTemplate.channel_name}:`, error);
      // Publish failure log
      await this.publishDeliveryLog({
        notification_id: notification.notification_id,
        event_id: notification.event_id,
        event_name: notification.event_name,
        channel_id: renderedTemplate.channel_id,
        channel_name: renderedTemplate.channel_name,
        stage: 'routed',
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
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
          notification_id: notificationId
        }
      };

      await this.kafkaService.publishMessage(KAFKA_TOPICS.NOTIFICATION_DLQ, [
        {
          key: notificationId || originalKey,
          value: dlqMessage
        }
      ]);

      this.logger.warn(`Sent message to DLQ: ${KAFKA_TOPICS.NOTIFICATION_DLQ}, notification_id: ${notificationId}`);
    } catch (dlqError) {
      this.logger.error('Failed to send message to DLQ:', dlqError);
      // Don't throw - we don't want DLQ failures to crash the worker
    }
  }

  /**
   * Check if notification has been processed recently (deduplication)
   */
  private isDuplicate(notificationId: string): boolean {
    const cacheKey = `dedup:notification:${notificationId}`;
    const cached = this.cacheService.get<boolean>(cacheKey);
    return cached === true;
  }

  /**
   * Mark notification as processed to prevent duplicates
   */
  private markAsProcessed(notificationId: string): void {
    const cacheKey = `dedup:notification:${notificationId}`;
    this.cacheService.set(cacheKey, true, this.DEDUP_TTL_SECONDS);
  }
}
