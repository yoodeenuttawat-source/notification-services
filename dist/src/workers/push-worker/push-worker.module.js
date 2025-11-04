"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PushWorkerModule = void 0;
const common_1 = require("@nestjs/common");
const push_worker_service_1 = require("./push-worker.service");
const kafka_module_1 = require("../../kafka/kafka.module");
const cache_module_1 = require("../../cache/cache.module");
const providers_module_1 = require("../../providers/providers.module");
let PushWorkerModule = class PushWorkerModule {
};
exports.PushWorkerModule = PushWorkerModule;
exports.PushWorkerModule = PushWorkerModule = __decorate([
    (0, common_1.Module)({
        imports: [kafka_module_1.KafkaModule, cache_module_1.CacheModule, providers_module_1.ProvidersModule],
        providers: [push_worker_service_1.PushWorkerService]
    })
], PushWorkerModule);
//# sourceMappingURL=push-worker.module.js.map