"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PushProviderService1 = void 0;
const base_provider_service_1 = require("../base-provider.service");
const uuid_1 = require("uuid");
class PushProviderService1 extends base_provider_service_1.BaseProviderService {
    constructor(circuitBreakerService, circuitBreakerConfig) {
        super(circuitBreakerService, {
            failureThreshold: 5,
            timeout: 60000,
            ...circuitBreakerConfig
        });
        this.providerName = 'PushProvider1';
        this.channelType = 'push';
    }
    async executeSend(payload) {
        const messageId = (0, uuid_1.v4)();
        console.log(`[${this.providerName}] Sending push notification:`);
        console.log(`  Recipient: ${payload.recipient}`);
        console.log(`  Subject: ${payload.subject || 'N/A'}`);
        console.log(`  Content: ${payload.content}`);
        console.log(`  Metadata:`, JSON.stringify(payload.metadata || {}, null, 2));
        console.log(`  Message ID: ${messageId}`);
        return {
            success: true,
            messageId: messageId
        };
    }
}
exports.PushProviderService1 = PushProviderService1;
//# sourceMappingURL=push-provider1.service.js.map