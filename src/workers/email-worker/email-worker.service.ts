import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { KafkaService } from '../../kafka/kafka.service';
import { ConfigService } from '../../cache/config.service';
import { ProviderFactoryService } from '../../providers/provider-factory.service';
import { KAFKA_TOPICS } from '../../kafka/kafka.config';
import { ChannelMessage } from '../../kafka/types/channel-message';
import { DeliveryLog } from '../../kafka/types/delivery-log';
import { CircuitBreakerOpenError } from '../../circuit-breaker/CircuitBreakerOpenError';

@Injectable()
export class EmailWorkerService implements OnModuleInit {
  private readonly logger = new Logger(EmailWorkerService.name);

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly configService: ConfigService,
    private readonly providerFactory: ProviderFactoryService
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing email worker...');
    
    this.logger.log(`Creating consumer for group: email-worker-group, topics: ${KAFKA_TOPICS.EMAIL_NOTIFICATION}`);
    const consumer = await this.kafkaService.createConsumer(
      'email-worker-group',
      [KAFKA_TOPICS.EMAIL_NOTIFICATION]
    );

    this.logger.log('Starting to consume messages from email notification topic...');
    await this.kafkaService.consumeMessages(consumer, async (payload) => {
      await this.processEmailNotification(payload);
    });

    this.logger.log('Email worker started and ready to process messages');
  }

  private async processEmailNotification(payload: any) {
    try {
      const message: ChannelMessage = JSON.parse(payload.message.value.toString());
      this.logger.log(`Processing email notification: ${message.notification_id}`);

      if (!message.template_subject) {
        this.logger.warn(`Email notification ${message.notification_id} missing subject`);
        await this.publishDeliveryLog({
          notification_id: message.notification_id,
          event_id: message.event_id,
          event_name: message.event_name,
          channel_id: message.channel_id,
          channel_name: message.channel_name,
          stage: 'provider_called',
          status: 'failed',
          error_message: 'Email subject is required'
        });
        return;
      }

      // Get providers for email channel
      const providers = await this.configService.getProvidersByChannel(message.channel_id);

      if (providers.length === 0) {
        this.logger.warn(`No providers found for channel_id: ${message.channel_id}`);
        await this.publishDeliveryLog({
          notification_id: message.notification_id,
          event_id: message.event_id,
          event_name: message.event_name,
          channel_id: message.channel_id,
          channel_name: message.channel_name,
          stage: 'provider_called',
          status: 'failed',
          error_message: 'No providers available'
        });
        return;
      }

      // Try providers in priority order
      let success = false;
      let lastError: Error | null = null;

      for (const providerConfig of providers) {
        try {
          const provider = this.providerFactory.getProvider(providerConfig.name);
          if (!provider) {
            this.logger.warn(`Provider ${providerConfig.name} not found in factory`);
            continue;
          }

          // Log provider call attempt
          await this.publishDeliveryLog({
            notification_id: message.notification_id,
            event_id: message.event_id,
            event_name: message.event_name,
            channel_id: message.channel_id,
            channel_name: message.channel_name,
            provider_name: providerConfig.name,
            stage: 'provider_called',
            status: 'pending'
          });

          const result = await provider.sendNotification({
            recipient: message.recipient,
            subject: message.template_subject!,
            content: message.template_content,
            metadata: message.metadata
          });

          // Success
          await this.publishDeliveryLog({
            notification_id: message.notification_id,
            event_id: message.event_id,
            event_name: message.event_name,
            channel_id: message.channel_id,
            channel_name: message.channel_name,
            provider_name: providerConfig.name,
            stage: 'provider_success',
            status: 'success',
            message_id: result.messageId
          });

          this.logger.log(
            `Email notification ${message.notification_id} sent via ${providerConfig.name}`
          );
          success = true;
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          if (error instanceof CircuitBreakerOpenError) {
            await this.publishDeliveryLog({
              notification_id: message.notification_id,
              event_id: message.event_id,
              event_name: message.event_name,
              channel_id: message.channel_id,
              channel_name: message.channel_name,
              provider_name: providerConfig.name,
              stage: 'circuit_breaker_open',
              status: 'failed',
              error_message: lastError.message
            });

            this.logger.warn(
              `Circuit breaker open for ${providerConfig.name}, trying next provider`
            );
            continue;
          }

          // Other errors
          await this.publishDeliveryLog({
            notification_id: message.notification_id,
            event_id: message.event_id,
            event_name: message.event_name,
            channel_id: message.channel_id,
            channel_name: message.channel_name,
            provider_name: providerConfig.name,
            stage: 'provider_failed',
            status: 'failed',
            error_message: lastError.message
          });

          this.logger.error(`Provider ${providerConfig.name} failed:`, lastError);
          // Continue to next provider
        }
      }

      if (!success) {
        this.logger.error(
          `All email providers failed for notification ${message.notification_id}:`,
          lastError
        );
      }
    } catch (error) {
      this.logger.error('Error processing email notification:', error);
      throw error;
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
