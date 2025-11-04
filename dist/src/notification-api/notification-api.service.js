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
var NotificationApiService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationApiService = void 0;
const common_1 = require("@nestjs/common");
const kafka_service_1 = require("../kafka/kafka.service");
const config_service_1 = require("../cache/config.service");
const database_service_1 = require("../database/database.service");
const kafka_config_1 = require("../kafka/kafka.config");
let NotificationApiService = NotificationApiService_1 = class NotificationApiService {
    constructor(kafkaService, configService, databaseService) {
        this.kafkaService = kafkaService;
        this.configService = configService;
        this.databaseService = databaseService;
        this.logger = new common_1.Logger(NotificationApiService_1.name);
    }
    async sendNotification(dto) {
        const eventInfo = await this.configService.getEventInfoByName(dto.event_type);
        if (!eventInfo) {
            throw new common_1.NotFoundException(`Event type '${dto.event_type}' not found`);
        }
        const { eventId, eventName } = eventInfo;
        const mappings = await this.configService.getEventChannelMappings(eventId);
        if (mappings.length === 0) {
            throw new common_1.BadRequestException(`No channels configured for event type '${dto.event_type}'`);
        }
        const renderedTemplates = [];
        for (const mapping of mappings) {
            const template = await this.configService.getTemplate(eventId, mapping.channel_id);
            if (!template) {
                this.logger.warn(`Template not found for event_id=${eventId}, channel_id=${mapping.channel_id}. Skipping channel.`);
                continue;
            }
            const requiredFields = template.required_fields || [];
            const missingFields = requiredFields.filter((field) => !(field in dto.data));
            if (missingFields.length > 0) {
                throw new common_1.BadRequestException(`Missing required fields for ${mapping.channel_name} channel: ${missingFields.join(', ')}`);
            }
            const renderedSubject = template.subject
                ? this.substituteVariables(template.subject, dto.data)
                : undefined;
            const renderedContent = this.substituteVariables(template.content, dto.data);
            const recipient = this.getRecipient(dto.data, mapping.channel_name);
            if (!recipient) {
                this.logger.warn(`Recipient not found in data for ${mapping.channel_name} channel. Skipping channel.`);
                continue;
            }
            renderedTemplates.push({
                channel_id: mapping.channel_id,
                channel_name: mapping.channel_name,
                template_id: template.template_id,
                template_name: template.name,
                subject: renderedSubject,
                content: renderedContent,
                recipient
            });
        }
        if (renderedTemplates.length === 0) {
            throw new common_1.BadRequestException(`No valid templates could be rendered for event type '${dto.event_type}'`);
        }
        const message = {
            notification_id: dto.notification_id,
            event_id: eventId,
            event_name: eventName,
            rendered_templates: renderedTemplates,
            data: dto.data,
            metadata: {
                ...dto.metadata,
                timestamp: new Date().toISOString()
            }
        };
        await this.kafkaService.publishMessage(kafka_config_1.KAFKA_TOPICS.NOTIFICATION, [
            {
                key: dto.notification_id,
                value: message
            }
        ]);
        this.logger.log(`Notification published: ${dto.notification_id}, event: ${eventName}, templates: ${renderedTemplates.length}`);
    }
    substituteVariables(template, data) {
        return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            return data[key] !== undefined ? String(data[key]) : match;
        });
    }
    getRecipient(data, channelName) {
        const channelLower = channelName.toLowerCase();
        if (channelLower === 'email') {
            return data.user_email || data.email || data.recipient || null;
        }
        else if (channelLower === 'push') {
            return data.user_id || data.device_token || data.recipient || null;
        }
        else {
            return data.user_id || data.recipient || null;
        }
    }
};
exports.NotificationApiService = NotificationApiService;
exports.NotificationApiService = NotificationApiService = NotificationApiService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [kafka_service_1.KafkaService,
        config_service_1.ConfigService,
        database_service_1.DatabaseService])
], NotificationApiService);
//# sourceMappingURL=notification-api.service.js.map