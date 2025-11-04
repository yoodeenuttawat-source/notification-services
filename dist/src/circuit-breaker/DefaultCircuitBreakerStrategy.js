"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultCircuitBreakerStrategy = void 0;
const CircuitBreakerState_1 = require("./CircuitBreakerState");
class DefaultCircuitBreakerStrategy {
    shouldAllowRequest(metrics, config) {
        const now = Date.now();
        switch (metrics.state) {
            case CircuitBreakerState_1.CircuitBreakerState.CLOSED:
                return true;
            case CircuitBreakerState_1.CircuitBreakerState.OPEN:
                if (metrics.lastFailureTime && (now - metrics.lastFailureTime) >= config.timeout) {
                    return true;
                }
                return false;
            case CircuitBreakerState_1.CircuitBreakerState.HALF_OPEN:
                return (metrics.successCount + metrics.failureCount) < config.halfOpenMaxCalls;
            default:
                return false;
        }
    }
    recordSuccess(metrics, config) {
        switch (metrics.state) {
            case CircuitBreakerState_1.CircuitBreakerState.CLOSED:
                return CircuitBreakerState_1.CircuitBreakerState.CLOSED;
            case CircuitBreakerState_1.CircuitBreakerState.HALF_OPEN:
                if (metrics.successCount + 1 >= config.successThreshold) {
                    return CircuitBreakerState_1.CircuitBreakerState.CLOSED;
                }
                return CircuitBreakerState_1.CircuitBreakerState.HALF_OPEN;
            case CircuitBreakerState_1.CircuitBreakerState.OPEN:
                return CircuitBreakerState_1.CircuitBreakerState.HALF_OPEN;
            default:
                return metrics.state;
        }
    }
    recordFailure(metrics, config) {
        switch (metrics.state) {
            case CircuitBreakerState_1.CircuitBreakerState.CLOSED:
                if (metrics.failureCount + 1 >= config.failureThreshold) {
                    return CircuitBreakerState_1.CircuitBreakerState.OPEN;
                }
                return CircuitBreakerState_1.CircuitBreakerState.CLOSED;
            case CircuitBreakerState_1.CircuitBreakerState.HALF_OPEN:
                return CircuitBreakerState_1.CircuitBreakerState.OPEN;
            case CircuitBreakerState_1.CircuitBreakerState.OPEN:
                return CircuitBreakerState_1.CircuitBreakerState.OPEN;
            default:
                return metrics.state;
        }
    }
}
exports.DefaultCircuitBreakerStrategy = DefaultCircuitBreakerStrategy;
//# sourceMappingURL=DefaultCircuitBreakerStrategy.js.map