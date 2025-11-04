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
var EmailWorkerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailWorkerService = void 0;
const common_1 = require("@nestjs/common");
const kafka_service_1 = require("../../kafka/kafka.service");
const config_service_1 = require("../../cache/config.service");
const provider_factory_service_1 = require("../../providers/provider-factory.service");
const kafka_config_1 = require("../../kafka/kafka.config");
const cache_service_1 = require("../../cache/cache.service");
let EmailWorkerService = EmailWorkerService_1 = class EmailWorkerService {
    constructor(kafkaService, configService, providerFactory, cacheService) {
        this.kafkaService = kafkaService;
        this.configService = configService;
        this.providerFactory = providerFactory;
        this.cacheService = cacheService;
        this.logger = new common_1.Logger(EmailWorkerService_1.name);
        this.DEDUP_TTL_SECONDS = 120;
    }
    async onModuleInit() {
        this.logger.log('Initializing email worker...');
        this.logger.log(`Creating consumer for group: email-worker-group, topics: ${kafka_config_1.KAFKA_TOPICS.EMAIL_NOTIFICATION}`);
        const consumer = await this.kafkaService.createConsumer('email-worker-group', [kafka_config_1.KAFKA_TOPICS.EMAIL_NOTIFICATION]);
        this.logger.log('Starting to consume messages from email notification topic...');
        await this.kafkaService.consumeMessages(consumer, async (payload) => {
            await this.processEmailNotification(payload);
        });
        this.logger.log('Email worker started and ready to process messages');
    }
    async processEmailNotification(payload) {
        const originalMessage = payload.message.value.toString();
        try {
            const message = await this.parseMessage(originalMessage);
            if (!message)
                return;
            if (this.isDuplicate(message.notification_id)) {
                this.logger.warn(`Duplicate email notification detected, skipping: ${message.notification_id}`);
                return;
            }
            this.markAsProcessed(message.notification_id);
            if (!await this.validateEmailMessage(message))
                return;
            const providers = await this.getProviders(message.channel_id);
            if (!providers || providers.length === 0) {
                await this.handleNoProviders(message, originalMessage, payload.message.key?.toString());
                return;
            }
            const result = await this.trySendNotification(message, providers);
            if (!result.success) {
                await this.handleAllProvidersFailed(originalMessage, payload.message.key?.toString(), message, result.error);
            }
        }
        catch (error) {
            this.logger.error('Unexpected error in email notification processing:', error);
            await this.handleProcessingError(originalMessage, payload.message.key?.toString(), error);
        }
    }
    async parseMessage(originalMessage) {
        try {
            return JSON.parse(originalMessage);
        }
        catch (parseError) {
            const parseErr = parseError instanceof Error ? parseError : new Error(String(parseError));
            this.logger.error('JSON parse error (non-retriable):', parseErr);
            await this.publishDeliveryLog({
                notification_id: 'unknown',
                event_id: 0,
                event_name: 'unknown',
                channel_id: 0,
                channel_name: 'EMAIL',
                stage: 'processing_failed',
                status: 'failed',
                error_message: `Invalid JSON message format: ${parseErr.message}`,
            });
            return null;
        }
    }
    async validateEmailMessage(message) {
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
                error_message: 'Email subject is required - invalid message data',
            });
            return false;
        }
        return true;
    }
    async getProviders(channelId) {
        try {
            return await this.configService.getProvidersByChannel(channelId);
        }
        catch (error) {
            this.logger.error(`Error getting providers for channel_id ${channelId}:`, error);
            return null;
        }
    }
    async handleNoProviders(message, originalMessage, originalKey) {
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
        await this.sendToDLQ(originalMessage, kafka_config_1.KAFKA_TOPICS.EMAIL_NOTIFICATION, originalKey, Error('No providers available - configuration issue'), message.notification_id);
    }
    async trySendNotification(message, providers) {
        this.logger.log(`Processing email notification: ${message.notification_id}`);
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
                this.logger.log(`Email notification ${message.notification_id} sent via ${providerConfig.name}`);
                return { success: true, error: null };
            }
            catch (providerError) {
                continue;
            }
        }
        return { success: false, error: new Error('All providers failed') };
    }
    async handleAllProvidersFailed(originalMessage, originalKey, message, error) {
        this.logger.error(`All email providers failed for notification ${message.notification_id}:`, error);
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
        await this.sendToDLQ(originalMessage, kafka_config_1.KAFKA_TOPICS.EMAIL_NOTIFICATION, originalKey, error, message.notification_id);
    }
    async handleProcessingError(originalMessage, originalKey, error) {
        this.logger.error('Error processing email notification:', error);
        const errorObj = error instanceof Error ? error : new Error(String(error));
        await this.publishDeliveryLog({
            notification_id: 'unknown',
            event_id: 0,
            event_name: 'unknown',
            channel_id: 0,
            channel_name: 'EMAIL',
            stage: 'processing_failed',
            status: 'failed',
            error_message: errorObj.message
        });
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
    async sendToDLQ(originalMessage, originalTopic, originalKey, error, notificationId) {
        try {
            const errorObj = error instanceof Error ? error : new Error(String(error));
            const dlqMessage = {
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
                    channel_name: 'EMAIL'
                }
            };
            await this.kafkaService.publishMessage(kafka_config_1.KAFKA_TOPICS.EMAIL_NOTIFICATION_DLQ, [
                {
                    key: notificationId || originalKey,
                    value: dlqMessage
                }
            ]);
            this.logger.warn(`Sent message to DLQ: ${kafka_config_1.KAFKA_TOPICS.EMAIL_NOTIFICATION_DLQ}, notification_id: ${notificationId}`);
        }
        catch (dlqError) {
            this.logger.error('Failed to send message to DLQ:', dlqError);
        }
    }
    isDuplicate(notificationId) {
        const cacheKey = `dedup:email:${notificationId}`;
        const cached = this.cacheService.get(cacheKey);
        return cached === true;
    }
    markAsProcessed(notificationId) {
        const cacheKey = `dedup:email:${notificationId}`;
        this.cacheService.set(cacheKey, true, this.DEDUP_TTL_SECONDS);
    }
};
exports.EmailWorkerService = EmailWorkerService;
exports.EmailWorkerService = EmailWorkerService = EmailWorkerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [kafka_service_1.KafkaService,
        config_service_1.ConfigService,
        provider_factory_service_1.ProviderFactoryService,
        cache_service_1.CacheService])
], EmailWorkerService);
//# sourceMappingURL=email-worker.service.js.map