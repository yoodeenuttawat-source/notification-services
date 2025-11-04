"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailProviderService2 = void 0;
const base_provider_service_1 = require("../base-provider.service");
const common_1 = require("@nestjs/common");
const uuid_1 = require("uuid");
class EmailProviderService2 extends base_provider_service_1.BaseProviderService {
    constructor(circuitBreakerService, kafkaService, circuitBreakerConfig) {
        super(circuitBreakerService, kafkaService, {
            failureThreshold: 5,
            timeout: 60000,
            ...circuitBreakerConfig,
        });
        this.providerName = 'EmailProvider2';
        this.channelType = 'email';
        this.logger = new common_1.Logger(EmailProviderService2.name);
    }
    getRequest(payload) {
        const idempotentKey = payload.context?.notification_id || 'unknown';
        return {
            recipient: payload.recipient,
            subject: payload.subject,
            content: payload.content,
            metadata: payload.metadata,
            idempotentKey: idempotentKey,
            from: process.env.EMAIL_FROM || 'noreply@example.com',
            to: payload.recipient,
        };
    }
    getUrl() {
        return (process.env.EMAIL_PROVIDER2_API_URL ||
            process.env.PROVIDER_API_URL ||
            'https://api.email-provider2.com/v1/send');
    }
    getHeaders(payload) {
        const idempotentKey = payload.context?.notification_id || 'unknown';
        return {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.PROVIDER_API_KEY || ''}`,
            'X-Idempotent-Key': idempotentKey,
            'X-Provider': 'EmailProvider2',
            'X-Provider-Version': '1.0',
        };
    }
    async executeSend(payload) {
        if (!payload.subject) {
            throw new Error('Email requires subject');
        }
        const messageId = (0, uuid_1.v4)();
        const idempotentKey = payload.context?.notification_id || 'unknown';
        const request = this.getRequest(payload);
        const headers = this.getHeaders(payload);
        const url = this.getUrl();
        this.logger.log(JSON.stringify({
            provider: this.providerName,
            action: 'sending_email_notification',
            url,
            headers,
            request,
            messageId,
            idempotentKey: idempotentKey,
        }));
        return {
            success: true,
            messageId: messageId,
        };
    }
}
exports.EmailProviderService2 = EmailProviderService2;
//# sourceMappingURL=email-provider2.service.js.map