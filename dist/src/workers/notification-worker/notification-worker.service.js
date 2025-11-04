"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var NotificationWorkerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationWorkerService = void 0;
const common_1 = require("@nestjs/common");
const kafka_service_1 = require("../../kafka/kafka.service");
const kafka_config_1 = require("../../kafka/kafka.config");
let NotificationWorkerService = NotificationWorkerService_1 = class NotificationWorkerService {
    constructor(kafkaService) {
        this.kafkaService = kafkaService;
        this.logger = new common_1.Logger(NotificationWorkerService_1.name);
    }
    async onModuleInit() {
        this.logger.log('Initializing notification worker...');
        this.logger.log(`Creating consumer for group: notification-worker-group, topics: ${kafka_config_1.KAFKA_TOPICS.NOTIFICATION}`);
        const consumer = await this.kafkaService.createConsumer('notification-worker-group', [kafka_config_1.KAFKA_TOPICS.NOTIFICATION]);
        this.logger.log('Starting to consume messages from notification topic...');
        await this.kafkaService.consumeMessages(consumer, async (payload) => {
            await this.processNotification(payload);
        });
        this.logger.log('Notification worker started and ready to process messages');
    }
    async processNotification(payload) {
        try {
            const message = JSON.parse(payload.message.value.toString());
            this.logger.log(`Processing notification: ${message.notification_id}`);
            if (!message.rendered_templates || message.rendered_templates.length === 0) {
                this.logger.warn(`No rendered templates found for notification: ${message.notification_id}`);
                return;
            }
            for (const renderedTemplate of message.rendered_templates) {
                await this.routeToChannel(message, renderedTemplate);
            }
        }
        catch (error) {
            this.logger.error('Error processing notification:', error);
            throw error;
        }
    }
    async routeToChannel(notification, renderedTemplate) {
        try {
            const channelMessage = {
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
            const topic = this.getChannelTopic(renderedTemplate.channel_name);
            await this.kafkaService.publishMessage(topic, [
                {
                    key: notification.notification_id,
                    value: channelMessage
                }
            ]);
            await this.publishDeliveryLog({
                notification_id: notification.notification_id,
                event_id: notification.event_id,
                event_name: notification.event_name,
                channel_id: renderedTemplate.channel_id,
                channel_name: renderedTemplate.channel_name,
                stage: 'routed',
                status: 'pending'
            });
            this.logger.log(`Routed notification ${notification.notification_id} to ${renderedTemplate.channel_name} channel`);
        }
        catch (error) {
            this.logger.error(`Error routing to channel ${renderedTemplate.channel_name}:`, error);
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
    getChannelTopic(channelName) {
        switch (channelName.toLowerCase()) {
            case 'push':
                return kafka_config_1.KAFKA_TOPICS.PUSH_NOTIFICATION;
            case 'email':
                return kafka_config_1.KAFKA_TOPICS.EMAIL_NOTIFICATION;
            default:
                throw new Error(`Unknown channel: ${channelName}`);
        }
    }
    async publishDeliveryLog(log) {
        const deliveryLog = {
            ...log,
            timestamp: new Date().toISOString()
        };
        await this.kafkaService.publishMessage(kafka_config_1.KAFKA_TOPICS.DELIVERY_LOGS, [
            {
                key: log.notification_id,
                value: deliveryLog
            }
        ]);
    }
};
exports.NotificationWorkerService = NotificationWorkerService;
exports.NotificationWorkerService = NotificationWorkerService = NotificationWorkerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [kafka_service_1.KafkaService])
], NotificationWorkerService);
//# sourceMappingURL=notification-worker.service.js.map