"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseProviderService = void 0;
const CircuitBreakerOpenError_1 = require("../circuit-breaker/CircuitBreakerOpenError");
const kafka_config_1 = require("../kafka/kafka.config");
class BaseProviderService {
    constructor(circuitBreakerService, kafkaService, circuitBreakerConfig) {
        this.circuitBreakerService = circuitBreakerService;
        this.kafkaService = kafkaService;
        this.circuitBreakerConfig = circuitBreakerConfig;
    }
    async sendNotification(payload) {
        if (!this.circuitBreakerService.shouldAllowRequest(this.providerName, this.circuitBreakerConfig)) {
            throw new CircuitBreakerOpenError_1.CircuitBreakerOpenError(`Circuit breaker is OPEN for ${this.providerName}. Request rejected.`);
        }
        const providerRequestId = payload.context?.notification_id || 'unknown';
        const requestTimestamp = new Date().toISOString();
        const request = this.getRequest(payload);
        const headers = this.getHeaders(payload);
        try {
            const result = await this.executeSend(payload);
            const responseTimestamp = new Date().toISOString();
            this.circuitBreakerService.recordSuccess(this.providerName, this.circuitBreakerConfig);
            if (this.kafkaService && payload.context) {
                await this.publishProviderResponse({
                    provider_request_id: providerRequestId,
                    notification_id: payload.context.notification_id,
                    event_id: payload.context.event_id,
                    event_name: payload.context.event_name,
                    channel_id: payload.context.channel_id,
                    channel_name: payload.context.channel_name,
                    provider_name: this.providerName,
                    request: JSON.stringify(request),
                    request_header: headers,
                    response: JSON.stringify({
                        success: true,
                        messageId: result.messageId
                    }),
                    request_timestamp: requestTimestamp,
                    response_timestamp: responseTimestamp
                });
                await this.publishDeliveryLog({
                    notification_id: payload.context.notification_id,
                    event_id: payload.context.event_id,
                    event_name: payload.context.event_name,
                    channel_id: payload.context.channel_id,
                    channel_name: payload.context.channel_name,
                    stage: 'provider_success',
                    status: 'success',
                    message_id: result.messageId,
                    provider_request_id: providerRequestId
                });
            }
            return {
                ...result,
                providerName: this.providerName,
                provider_request_id: providerRequestId
            };
        }
        catch (error) {
            const responseTimestamp = new Date().toISOString();
            const errorObj = error instanceof Error ? error : new Error(String(error));
            this.circuitBreakerService.recordFailure(this.providerName, this.circuitBreakerConfig);
            if (this.kafkaService && payload.context) {
                await this.publishProviderResponse({
                    provider_request_id: providerRequestId,
                    notification_id: payload.context.notification_id,
                    event_id: payload.context.event_id,
                    event_name: payload.context.event_name,
                    channel_id: payload.context.channel_id,
                    channel_name: payload.context.channel_name,
                    provider_name: this.providerName,
                    request: JSON.stringify(request),
                    request_header: headers,
                    response: JSON.stringify({
                        success: false,
                        error: {
                            message: errorObj.message,
                            stack: errorObj.stack,
                            type: errorObj.constructor.name
                        }
                    }),
                    request_timestamp: requestTimestamp,
                    response_timestamp: responseTimestamp
                });
            }
            throw error;
        }
    }
    async publishProviderResponse(response) {
        if (!this.kafkaService) {
            return;
        }
        const providerResponse = {
            ...response,
            timestamp: new Date().toISOString()
        };
        await this.kafkaService.publishMessage(kafka_config_1.KAFKA_TOPICS.PROVIDER_RESPONSE, [
            {
                key: response.provider_request_id,
                value: providerResponse
            }
        ]);
    }
    async publishDeliveryLog(log) {
        if (!this.kafkaService) {
            return;
        }
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
    getCircuitBreakerState() {
        return this.circuitBreakerService.getState(this.providerName);
    }
    getName() {
        return this.providerName;
    }
    getChannelType() {
        return this.channelType;
    }
}
exports.BaseProviderService = BaseProviderService;
//# sourceMappingURL=base-provider.service.js.map