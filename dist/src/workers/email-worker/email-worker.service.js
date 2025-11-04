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
const channel_worker_base_service_1 = require("../channel-worker-base.service");
const cache_service_1 = require("../../cache/cache.service");
let EmailWorkerService = EmailWorkerService_1 = class EmailWorkerService extends channel_worker_base_service_1.ChannelWorkerBaseService {
    constructor(kafkaService, cacheService, configService, providerFactory) {
        super(kafkaService, cacheService, configService, providerFactory, EmailWorkerService_1.name);
        this.kafkaService = kafkaService;
        this.cacheService = cacheService;
        this.configService = configService;
        this.providerFactory = providerFactory;
    }
    getDedupKeyPrefix() {
        return 'dedup:email:';
    }
    getDefaultChannelName() {
        return 'EMAIL';
    }
    getDLQTopic() {
        return kafka_config_1.KAFKA_TOPICS.EMAIL_NOTIFICATION_DLQ;
    }
    getChannelTopic() {
        return kafka_config_1.KAFKA_TOPICS.EMAIL_NOTIFICATION;
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
            const result = await this.trySendNotification(message, providers, 'Email');
            if (!result.success) {
                await this.handleAllProvidersFailed(originalMessage, payload.message.key?.toString(), message, result.error, 'Email');
            }
        }
        catch (error) {
            await this.handleProcessingError(originalMessage, payload.message.key?.toString(), error, kafka_config_1.KAFKA_TOPICS.NOTIFICATION);
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
};
exports.EmailWorkerService = EmailWorkerService;
exports.EmailWorkerService = EmailWorkerService = EmailWorkerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [kafka_service_1.KafkaService,
        cache_service_1.CacheService,
        config_service_1.ConfigService,
        provider_factory_service_1.ProviderFactoryService])
], EmailWorkerService);
//# sourceMappingURL=email-worker.service.js.map