"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitBreakerOpenError = void 0;
class CircuitBreakerOpenError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CircuitBreakerOpenError';
        Object.setPrototypeOf(this, CircuitBreakerOpenError.prototype);
    }
}
exports.CircuitBreakerOpenError = CircuitBreakerOpenError;
//# sourceMappingURL=CircuitBreakerOpenError.js.map