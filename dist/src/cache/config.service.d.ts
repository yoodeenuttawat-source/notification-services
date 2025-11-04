import { OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CacheService } from './cache.service';
interface TemplateCache {
    template_id: number;
    event_id: number;
    channel_id: number;
    name: string;
    subject?: string;
    content: string;
    variables: Record<string, any>;
    required_fields: string[];
}
interface EventChannelMappingCache {
    event_id: number;
    event_name: string;
    channel_id: number;
    channel_name: string;
}
interface ProviderCache {
    provider_id: number;
    name: string;
    channel_id: number;
    priority: number;
}
export declare class ConfigService implements OnModuleInit {
    private readonly databaseService;
    private readonly cacheService;
    private readonly logger;
    private readonly CACHE_KEYS;
    constructor(databaseService: DatabaseService, cacheService: CacheService);
    onModuleInit(): Promise<void>;
    refreshCachePeriodically(): Promise<void>;
    refreshCache(): Promise<void>;
    private cacheTemplates;
    private cacheEventChannelMappings;
    private cacheProviders;
    private cacheEvents;
    private cacheChannels;
    getTemplate(eventId: number, channelId: number): Promise<TemplateCache | null>;
    getEventChannelMappings(eventId: number): Promise<EventChannelMappingCache[]>;
    getProvidersByChannel(channelId: number): Promise<ProviderCache[]>;
    getEventInfoByName(eventName: string): Promise<{
        eventId: number;
        eventName: string;
    } | null>;
}
export {};
