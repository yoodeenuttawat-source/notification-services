import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { KafkaService } from '../../kafka/kafka.service';
import { KAFKA_TOPICS } from '../../kafka/kafka.config';
import { NotificationMessage } from '../../kafka/types/notification-message';
import { ChannelMessage } from '../../kafka/types/channel-message';
import { DeliveryLog } from '../../kafka/types/delivery-log';

@Injectable()
export class NotificationWorkerService implements OnModuleInit {
  private readonly logger = new Logger(NotificationWorkerService.name);

  constructor(
    private readonly kafkaService: KafkaService
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
    try {
      const message: NotificationMessage = JSON.parse(payload.message.value.toString());
      this.logger.log(`Processing notification: ${message.notification_id}`);

      if (!message.rendered_templates || message.rendered_templates.length === 0) {
        this.logger.warn(`No rendered templates found for notification: ${message.notification_id}`);
        return;
      }

      // Route each rendered template to its channel topic
      for (const renderedTemplate of message.rendered_templates) {
        await this.routeToChannel(message, renderedTemplate);
      }
    } catch (error) {
      this.logger.error('Error processing notification:', error);
      throw error;
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
        status: 'pending'
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
        error_message: error instanceof Error ? error.message : 'Unknown error'
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
}
