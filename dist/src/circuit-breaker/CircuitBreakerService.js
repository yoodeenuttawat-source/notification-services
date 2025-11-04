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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitBreakerService = void 0;
const common_1 = require("@nestjs/common");
const CircuitBreakerState_1 = require("./CircuitBreakerState");
const DefaultCircuitBreakerStrategy_1 = require("./DefaultCircuitBreakerStrategy");
let CircuitBreakerService = class CircuitBreakerService {
    constructor(defaultConfig) {
        this.metrics = new Map();
        this.strategies = new Map();
        this.defaultConfig = defaultConfig || {
            failureThreshold: 5,
            successThreshold: 3,
            timeout: 60000,
            halfOpenMaxCalls: 3,
        };
    }
    registerStrategy(providerName, strategy) {
        this.strategies.set(providerName, strategy);
    }
    getMetrics(providerName) {
        if (!this.metrics.has(providerName)) {
            this.metrics.set(providerName, {
                failureCount: 0,
                successCount: 0,
                lastFailureTime: null,
                state: CircuitBreakerState_1.CircuitBreakerState.CLOSED,
                lastStateChangeTime: Date.now(),
            });
        }
        return this.metrics.get(providerName);
    }
    getStrategy(providerName) {
        return this.strategies.get(providerName) || new DefaultCircuitBreakerStrategy_1.DefaultCircuitBreakerStrategy();
    }
    shouldAllowRequest(providerName, config) {
        const metrics = this.getMetrics(providerName);
        const strategy = this.getStrategy(providerName);
        const effectiveConfig = { ...this.defaultConfig, ...config };
        this.updateStateIfNeeded(providerName, effectiveConfig);
        const shouldAllow = strategy.shouldAllowRequest(metrics, effectiveConfig);
        return shouldAllow;
    }
    recordSuccess(providerName, config) {
        const metrics = this.getMetrics(providerName);
        const strategy = this.getStrategy(providerName);
        const effectiveConfig = { ...this.defaultConfig, ...config };
        const newState = strategy.recordSuccess(metrics, effectiveConfig);
        this.updateMetrics(providerName, {
            ...metrics,
            successCount: metrics.state === CircuitBreakerState_1.CircuitBreakerState.HALF_OPEN ? metrics.successCount + 1 : 0,
            failureCount: newState === CircuitBreakerState_1.CircuitBreakerState.CLOSED ? 0 : metrics.failureCount,
            state: newState,
            lastStateChangeTime: newState !== metrics.state ? Date.now() : metrics.lastStateChangeTime,
        });
    }
    recordFailure(providerName, config) {
        const metrics = this.getMetrics(providerName);
        const strategy = this.getStrategy(providerName);
        const effectiveConfig = { ...this.defaultConfig, ...config };
        const newState = strategy.recordFailure(metrics, effectiveConfig);
        this.updateMetrics(providerName, {
            ...metrics,
            failureCount: metrics.state === CircuitBreakerState_1.CircuitBreakerState.CLOSED
                ? metrics.failureCount + 1
                : newState === CircuitBreakerState_1.CircuitBreakerState.OPEN
                    ? metrics.failureCount + 1
                    : metrics.failureCount,
            successCount: newState === CircuitBreakerState_1.CircuitBreakerState.OPEN ? 0 : metrics.successCount,
            lastFailureTime: Date.now(),
            state: newState,
            lastStateChangeTime: newState !== metrics.state ? Date.now() : metrics.lastStateChangeTime,
        });
    }
    getState(providerName) {
        return this.getMetrics(providerName).state;
    }
    getMetricsForProvider(providerName) {
        return { ...this.getMetrics(providerName) };
    }
    reset(providerName) {
        this.metrics.delete(providerName);
    }
    updateMetrics(providerName, newMetrics) {
        this.metrics.set(providerName, newMetrics);
    }
    updateStateIfNeeded(providerName, config) {
        const metrics = this.getMetrics(providerName);
        if (metrics.state === CircuitBreakerState_1.CircuitBreakerState.OPEN && metrics.lastFailureTime) {
            const now = Date.now();
            if (now - metrics.lastFailureTime >= config.timeout) {
                this.updateMetrics(providerName, {
                    ...metrics,
                    state: CircuitBreakerState_1.CircuitBreakerState.HALF_OPEN,
                    lastStateChangeTime: now,
                    successCount: 0,
                    failureCount: 0,
                });
            }
        }
    }
};
exports.CircuitBreakerService = CircuitBreakerService;
exports.CircuitBreakerService = CircuitBreakerService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [Object])
], CircuitBreakerService);
//# sourceMappingURL=CircuitBreakerService.js.map