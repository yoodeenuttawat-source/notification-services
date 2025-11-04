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
var ConfigService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const database_service_1 = require("../database/database.service");
const cache_service_1 = require("./cache.service");
let ConfigService = ConfigService_1 = class ConfigService {
    constructor(databaseService, cacheService) {
        this.databaseService = databaseService;
        this.cacheService = cacheService;
        this.logger = new common_1.Logger(ConfigService_1.name);
        this.CACHE_KEYS = {
            TEMPLATES: 'config:templates',
            EVENT_CHANNEL_MAPPINGS: 'config:event_channel_mappings',
            PROVIDERS: 'config:providers',
            EVENTS: 'config:events',
            CHANNELS: 'config:channels'
        };
    }
    async onModuleInit() {
        await this.refreshCache();
    }
    async refreshCache() {
        this.logger.log('Refreshing configuration cache...');
        try {
            await Promise.all([
                this.cacheTemplates(),
                this.cacheEventChannelMappings(),
                this.cacheProviders(),
                this.cacheEvents(),
                this.cacheChannels()
            ]);
            this.logger.log('Configuration cache refreshed successfully');
        }
        catch (error) {
            this.logger.error('Failed to refresh cache:', error);
        }
    }
    async cacheTemplates() {
        const result = await this.databaseService.callProcedure('get_all_templates');
        const templatesByEventChannel = new Map();
        for (const template of result.rows) {
            const key = `${template.event_id}:${template.channel_id}`;
            templatesByEventChannel.set(key, template);
        }
        await this.cacheService.set(this.CACHE_KEYS.TEMPLATES, Object.fromEntries(templatesByEventChannel), 300);
    }
    async cacheEventChannelMappings() {
        const result = await this.databaseService.callProcedure('get_all_event_channel_mappings');
        const mappingsByEvent = new Map();
        for (const mapping of result.rows) {
            if (!mappingsByEvent.has(mapping.event_id)) {
                mappingsByEvent.set(mapping.event_id, []);
            }
            mappingsByEvent.get(mapping.event_id).push(mapping);
        }
        await this.cacheService.set(this.CACHE_KEYS.EVENT_CHANNEL_MAPPINGS, Object.fromEntries(mappingsByEvent), 300);
    }
    async cacheProviders() {
        const result = await this.databaseService.callProcedure('get_all_providers');
        const providersByChannel = new Map();
        for (const provider of result.rows) {
            if (!providersByChannel.has(provider.channel_id)) {
                providersByChannel.set(provider.channel_id, []);
            }
            providersByChannel.get(provider.channel_id).push(provider);
        }
        await this.cacheService.set(this.CACHE_KEYS.PROVIDERS, Object.fromEntries(providersByChannel), 300);
    }
    async cacheEvents() {
        const result = await this.databaseService.callProcedure('get_all_events');
        const eventsMap = new Map();
        for (const event of result.rows) {
            eventsMap.set(event.event_id, event.name);
        }
        await this.cacheService.set(this.CACHE_KEYS.EVENTS, Object.fromEntries(eventsMap), 300);
    }
    async cacheChannels() {
        const result = await this.databaseService.callProcedure('get_all_channels');
        const channelsMap = new Map();
        for (const channel of result.rows) {
            channelsMap.set(channel.channel_id, channel.channel);
        }
        await this.cacheService.set(this.CACHE_KEYS.CHANNELS, Object.fromEntries(channelsMap), 300);
    }
    async getTemplate(eventId, channelId) {
        const cached = await this.cacheService.get(this.CACHE_KEYS.TEMPLATES);
        if (cached) {
            const key = `${eventId}:${channelId}`;
            return cached[key] || null;
        }
        const result = await this.databaseService.callProcedure('get_all_templates');
        const template = result.rows.find(t => t.event_id === eventId && t.channel_id === channelId);
        return template || null;
    }
    async getEventChannelMappings(eventId) {
        const cached = await this.cacheService.get(this.CACHE_KEYS.EVENT_CHANNEL_MAPPINGS);
        if (cached && cached[eventId]) {
            return cached[eventId];
        }
        const result = await this.databaseService.callProcedure('get_all_event_channel_mappings');
        return result.rows.filter(m => m.event_id === eventId);
    }
    async getProvidersByChannel(channelId) {
        const cached = await this.cacheService.get(this.CACHE_KEYS.PROVIDERS);
        if (cached && cached[channelId]) {
            return cached[channelId];
        }
        const result = await this.databaseService.callProcedure('get_all_providers');
        return result.rows.filter(p => p.channel_id === channelId);
    }
    async getEventInfoByName(eventName) {
        const cached = await this.cacheService.get(this.CACHE_KEYS.EVENTS);
        if (cached) {
            const entry = Object.entries(cached).find(([_, name]) => name === eventName);
            if (entry) {
                const eventId = parseInt(entry[0], 10);
                return { eventId, eventName };
            }
        }
        const result = await this.databaseService.callProcedure('get_all_events');
        const event = result.rows.find(e => e.name === eventName);
        if (event) {
            return { eventId: event.event_id, eventName: event.name };
        }
        return null;
    }
};
exports.ConfigService = ConfigService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_5_MINUTES),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ConfigService.prototype, "refreshCache", null);
exports.ConfigService = ConfigService = ConfigService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        cache_service_1.CacheService])
], ConfigService);
//# sourceMappingURL=config.service.js.map