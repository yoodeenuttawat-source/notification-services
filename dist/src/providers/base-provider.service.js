"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseProviderService = void 0;
const CircuitBreakerOpenError_1 = require("../circuit-breaker/CircuitBreakerOpenError");
class BaseProviderService {
    constructor(circuitBreakerService, circuitBreakerConfig) {
        this.circuitBreakerService = circuitBreakerService;
        this.circuitBreakerConfig = circuitBreakerConfig;
    }
    async sendNotification(payload) {
        if (!this.circuitBreakerService.shouldAllowRequest(this.providerName, this.circuitBreakerConfig)) {
            throw new CircuitBreakerOpenError_1.CircuitBreakerOpenError(`Circuit breaker is OPEN for ${this.providerName}. Request rejected.`);
        }
        try {
            const result = await this.executeSend(payload);
            this.circuitBreakerService.recordSuccess(this.providerName, this.circuitBreakerConfig);
            return {
                ...result,
                providerName: this.providerName
            };
        }
        catch (error) {
            this.circuitBreakerService.recordFailure(this.providerName, this.circuitBreakerConfig);
            throw error;
        }
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