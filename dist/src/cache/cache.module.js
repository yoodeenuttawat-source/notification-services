"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheModule = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const cache_service_1 = require("./cache.service");
const config_service_1 = require("./config.service");
const database_module_1 = require("../database/database.module");
const database_service_1 = require("../database/database.service");
let CacheModule = class CacheModule {
};
exports.CacheModule = CacheModule;
exports.CacheModule = CacheModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [schedule_1.ScheduleModule.forRoot(), database_module_1.DatabaseModule],
        providers: [
            {
                provide: cache_service_1.CacheService,
                useFactory: () => {
                    return new cache_service_1.CacheService({
                        maxSize: parseInt(process.env.CACHE_MAX_SIZE || '10000', 10),
                        cacheName: 'CacheService',
                    });
                },
            },
            {
                provide: config_service_1.ConfigService,
                useFactory: (databaseService, cacheService) => {
                    return new config_service_1.ConfigService(databaseService, cacheService);
                },
                inject: [database_service_1.DatabaseService, cache_service_1.CacheService],
            },
        ],
        exports: [cache_service_1.CacheService, config_service_1.ConfigService],
    })
], CacheModule);
//# sourceMappingURL=cache.module.js.map