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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderFactoryService = void 0;
const common_1 = require("@nestjs/common");
const CircuitBreakerService_1 = require("../circuit-breaker/CircuitBreakerService");
const push_provider1_service_1 = require("./push/push-provider1.service");
const push_provider2_service_1 = require("./push/push-provider2.service");
const email_provider1_service_1 = require("./email/email-provider1.service");
const email_provider2_service_1 = require("./email/email-provider2.service");
let ProviderFactoryService = class ProviderFactoryService {
    constructor(circuitBreakerService) {
        this.circuitBreakerService = circuitBreakerService;
        this.providers = new Map();
        this.providers.set('PushProvider1', new push_provider1_service_1.PushProviderService1(this.circuitBreakerService));
        this.providers.set('PushProvider2', new push_provider2_service_1.PushProviderService2(this.circuitBreakerService));
        this.providers.set('EmailProvider1', new email_provider1_service_1.EmailProviderService1(this.circuitBreakerService));
        this.providers.set('EmailProvider2', new email_provider2_service_1.EmailProviderService2(this.circuitBreakerService));
    }
    getProvider(name) {
        return this.providers.get(name);
    }
    getAllProviders() {
        return Array.from(this.providers.values());
    }
};
exports.ProviderFactoryService = ProviderFactoryService;
exports.ProviderFactoryService = ProviderFactoryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [CircuitBreakerService_1.CircuitBreakerService])
], ProviderFactoryService);
//# sourceMappingURL=provider-factory.service.js.map