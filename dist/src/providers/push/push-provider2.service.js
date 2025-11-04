"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PushProviderService2 = void 0;
const base_provider_service_1 = require("../base-provider.service");
const common_1 = require("@nestjs/common");
const uuid_1 = require("uuid");
class PushProviderService2 extends base_provider_service_1.BaseProviderService {
    constructor(circuitBreakerService, kafkaService, circuitBreakerConfig) {
        super(circuitBreakerService, kafkaService, {
            failureThreshold: 3,
            timeout: 45000,
            ...circuitBreakerConfig,
        });
        this.providerName = 'PushProvider2';
        this.channelType = 'push';
        this.logger = new common_1.Logger(PushProviderService2.name);
    }
    getRequest(payload) {
        const idempotentKey = payload.context?.notification_id || 'unknown';
        return {
            target: payload.recipient,
            notification: {
                title: payload.subject || null,
                message: payload.content,
            },
            metadata: payload.metadata,
            idempotentKey: idempotentKey,
        };
    }
    getUrl() {
        return (process.env.PUSH_PROVIDER2_API_URL ||
            process.env.PROVIDER_API_URL ||
            'https://api.push-provider2.com/v1/notifications');
    }
    getHeaders(payload) {
        const idempotentKey = payload.context?.notification_id || 'unknown';
        return {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.PROVIDER_API_KEY || ''}`,
            'X-Idempotent-Key': idempotentKey,
            'X-Provider': 'PushProvider2',
            'X-Provider-Version': '2.0',
        };
    }
    async executeSend(payload) {
        const messageId = (0, uuid_1.v4)();
        const idempotentKey = payload.context?.notification_id || 'unknown';
        const request = this.getRequest(payload);
        const headers = this.getHeaders(payload);
        const url = this.getUrl();
        this.logger.log(JSON.stringify({
            provider: this.providerName,
            action: 'sending_push_notification',
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
exports.PushProviderService2 = PushProviderService2;
//# sourceMappingURL=push-provider2.service.js.map