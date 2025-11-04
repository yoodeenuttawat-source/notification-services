"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailProviderService1 = void 0;
const base_provider_service_1 = require("../base-provider.service");
const uuid_1 = require("uuid");
class EmailProviderService1 extends base_provider_service_1.BaseProviderService {
    constructor(circuitBreakerService, circuitBreakerConfig) {
        super(circuitBreakerService, {
            failureThreshold: 5,
            timeout: 60000,
            ...circuitBreakerConfig
        });
        this.providerName = 'EmailProvider1';
        this.channelType = 'email';
    }
    async executeSend(payload) {
        if (!payload.subject) {
            throw new Error('Email requires subject');
        }
        const messageId = (0, uuid_1.v4)();
        console.log(`[${this.providerName}] Sending email notification:`);
        console.log(`  From: ${process.env.EMAIL_FROM || 'noreply@example.com'}`);
        console.log(`  To: ${payload.recipient}`);
        console.log(`  Subject: ${payload.subject}`);
        console.log(`  Content: ${payload.content}`);
        console.log(`  Metadata:`, JSON.stringify(payload.metadata || {}, null, 2));
        console.log(`  Message ID: ${messageId}`);
        return {
            success: true,
            messageId: messageId
        };
    }
}
exports.EmailProviderService1 = EmailProviderService1;
//# sourceMappingURL=email-provider1.service.js.map