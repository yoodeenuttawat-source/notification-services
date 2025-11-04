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
var PushWorkerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PushWorkerService = void 0;
const common_1 = require("@nestjs/common");
const kafka_service_1 = require("../../kafka/kafka.service");
const config_service_1 = require("../../cache/config.service");
const provider_factory_service_1 = require("../../providers/provider-factory.service");
const kafka_config_1 = require("../../kafka/kafka.config");
const CircuitBreakerOpenError_1 = require("../../circuit-breaker/CircuitBreakerOpenError");
let PushWorkerService = PushWorkerService_1 = class PushWorkerService {
    constructor(kafkaService, configService, providerFactory) {
        this.kafkaService = kafkaService;
        this.configService = configService;
        this.providerFactory = providerFactory;
        this.logger = new common_1.Logger(PushWorkerService_1.name);
    }
    async onModuleInit() {
        this.logger.log('Initializing push worker...');
        this.logger.log(`Creating consumer for group: push-worker-group, topics: ${kafka_config_1.KAFKA_TOPICS.PUSH_NOTIFICATION}`);
        const consumer = await this.kafkaService.createConsumer('push-worker-group', [kafka_config_1.KAFKA_TOPICS.PUSH_NOTIFICATION]);
        this.logger.log('Starting to consume messages from push notification topic...');
        await this.kafkaService.consumeMessages(consumer, async (payload) => {
            await this.processPushNotification(payload);
        });
        this.logger.log('Push worker started and ready to process messages');
    }
    async processPushNotification(payload) {
        try {
            const message = JSON.parse(payload.message.value.toString());
            this.logger.log(`Processing push notification: ${message.notification_id}`);
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
            let success = false;
            let lastError = null;
            for (const providerConfig of providers) {
                try {
                    const provider = this.providerFactory.getProvider(providerConfig.name);
                    if (!provider) {
                        this.logger.warn(`Provider ${providerConfig.name} not found in factory`);
                        continue;
                    }
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
                        subject: message.template_subject,
                        content: message.template_content,
                        metadata: message.metadata
                    });
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
                    this.logger.log(`Push notification ${message.notification_id} sent via ${providerConfig.name}`);
                    success = true;
                    break;
                }
                catch (error) {
                    lastError = error instanceof Error ? error : new Error(String(error));
                    if (error instanceof CircuitBreakerOpenError_1.CircuitBreakerOpenError) {
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
                        this.logger.warn(`Circuit breaker open for ${providerConfig.name}, trying next provider`);
                        continue;
                    }
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
                }
            }
            if (!success) {
                this.logger.error(`All push providers failed for notification ${message.notification_id}:`, lastError);
            }
        }
        catch (error) {
            this.logger.error('Error processing push notification:', error);
            throw error;
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
exports.PushWorkerService = PushWorkerService;
exports.PushWorkerService = PushWorkerService = PushWorkerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [kafka_service_1.KafkaService,
        config_service_1.ConfigService,
        provider_factory_service_1.ProviderFactoryService])
], PushWorkerService);
//# sourceMappingURL=push-worker.service.js.map