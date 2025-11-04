"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PushProviderService1 = void 0;
const base_provider_service_1 = require("../base-provider.service");
const common_1 = require("@nestjs/common");
const uuid_1 = require("uuid");
class PushProviderService1 extends base_provider_service_1.BaseProviderService {
    constructor(circuitBreakerService, kafkaService, circuitBreakerConfig) {
        super(circuitBreakerService, kafkaService, {
            failureThreshold: 5,
            timeout: 60000,
            ...circuitBreakerConfig
        });
        this.providerName = 'PushProvider1';
        this.channelType = 'push';
        this.logger = new common_1.Logger(PushProviderService1.name);
    }
    getRequest(payload) {
        const idempotentKey = payload.context?.notification_id || 'unknown';
        return {
            deviceToken: payload.recipient,
            title: payload.subject || null,
            body: payload.content,
            metadata: payload.metadata,
            idempotentKey: idempotentKey
        };
    }
    getUrl() {
        return process.env.PUSH_PROVIDER1_API_URL || process.env.PROVIDER_API_URL || 'https://api.push-provider1.com/v1/push';
    }
    getHeaders(payload) {
        const idempotentKey = payload.context?.notification_id || 'unknown';
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.PROVIDER_API_KEY || ''}`,
            'X-Idempotent-Key': idempotentKey,
            'X-Provider': 'PushProvider1',
            'X-Provider-Version': '1.0'
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
            idempotentKey: idempotentKey
        }));
        return {
            success: true,
            messageId: messageId
        };
    }
}
exports.PushProviderService1 = PushProviderService1;
//# sourceMappingURL=push-provider1.service.js.map