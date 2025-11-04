import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { KafkaService } from '../kafka/kafka.service';
import { ConfigService } from '../cache/config.service';
import { DatabaseService } from '../database/database.service';
import { KAFKA_TOPICS } from '../kafka/kafka.config';
import { NotificationMessage, RenderedTemplate } from '../kafka/types/notification-message';
import { SendNotificationDto } from './dto/send-notification.dto';

@Injectable()
export class NotificationApiService {
  private readonly logger = new Logger(NotificationApiService.name);

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService
  ) {}

  async sendNotification(dto: SendNotificationDto): Promise<void> {
    // 1. Get event ID and name from event_type name using ConfigService
    const eventInfo = await this.configService.getEventInfoByName(dto.event_type);
    if (!eventInfo) {
      throw new NotFoundException(`Event type '${dto.event_type}' not found`);
    }

    const { eventId, eventName } = eventInfo;

    // 2. Get event-channel mappings
    const mappings = await this.configService.getEventChannelMappings(eventId);
    if (mappings.length === 0) {
      throw new BadRequestException(`No channels configured for event type '${dto.event_type}'`);
    }

    // 3. Render templates for all channels
    const renderedTemplates: RenderedTemplate[] = [];

    for (const mapping of mappings) {
      const template = await this.configService.getTemplate(eventId, mapping.channel_id);
      if (!template) {
        this.logger.warn(
          `Template not found for event_id=${eventId}, channel_id=${mapping.channel_id}. Skipping channel.`
        );
        continue;
      }

      // Validate required fields
      const requiredFields = template.required_fields || [];
      const missingFields = requiredFields.filter((field) => !(field in dto.data));

      if (missingFields.length > 0) {
        throw new BadRequestException(
          `Missing required fields for ${mapping.channel_name} channel: ${missingFields.join(', ')}`
        );
      }

      // Render template (substitute variables)
      const renderedSubject = template.subject
        ? this.substituteVariables(template.subject, dto.data)
        : undefined;
      const renderedContent = this.substituteVariables(template.content, dto.data);

      // Get recipient based on channel type
      const recipient = this.getRecipient(dto.data, mapping.channel_name);

      if (!recipient) {
        this.logger.warn(
          `Recipient not found in data for ${mapping.channel_name} channel. Skipping channel.`
        );
        continue;
      }

      renderedTemplates.push({
        channel_id: mapping.channel_id,
        channel_name: mapping.channel_name,
        template_id: template.template_id,
        template_name: template.name,
        subject: renderedSubject,
        content: renderedContent,
        recipient,
      });
    }

    if (renderedTemplates.length === 0) {
      throw new BadRequestException(
        `No valid templates could be rendered for event type '${dto.event_type}'`
      );
    }

    // 4. Publish message to Kafka notification topic with pre-rendered templates
    const message: NotificationMessage = {
      notification_id: dto.notification_id,
      event_id: eventId,
      event_name: eventName,
      rendered_templates: renderedTemplates,
      data: dto.data,
      metadata: {
        ...dto.metadata,
        timestamp: new Date().toISOString(),
      },
    };

    await this.kafkaService.publishMessage(KAFKA_TOPICS.NOTIFICATION, [
      {
        key: dto.notification_id,
        value: message,
      },
    ]);

    this.logger.log(
      `Notification published: ${dto.notification_id}, event: ${eventName}, templates: ${renderedTemplates.length}`
    );
  }

  /**
   * Substitute variables in template string
   */
  private substituteVariables(template: string, data: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] !== undefined ? String(data[key]) : match;
    });
  }

  /**
   * Get recipient from data based on channel type
   */
  private getRecipient(data: Record<string, any>, channelName: string): string | null {
    const channelLower = channelName.toLowerCase();
    if (channelLower === 'email') {
      return data.user_email || data.email || data.recipient || null;
    } else if (channelLower === 'push') {
      return data.user_id || data.device_token || data.recipient || null;
    } else {
      return data.user_id || data.recipient || null;
    }
  }
}
