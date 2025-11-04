import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
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

@Injectable()
export class ConfigService implements OnModuleInit {
  private readonly logger = new Logger(ConfigService.name);
  private readonly CACHE_KEYS = {
    TEMPLATES: 'config:templates',
    EVENT_CHANNEL_MAPPINGS: 'config:event_channel_mappings',
    PROVIDERS: 'config:providers',
    EVENTS: 'config:events',
    CHANNELS: 'config:channels',
  };

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly cacheService: CacheService
  ) {}

  async onModuleInit() {
    try {
      await this.refreshCache();
      this.logger.log('Configuration cache initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize configuration cache:', error);
      throw error;
    }
  }

  /**
   * Refresh cache every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async refreshCachePeriodically() {
    try {
      await this.refreshCache();
    } catch (error) {
      this.logger.error('Failed to refresh cache periodically:', error);
    }
  }

  async refreshCache() {
    this.logger.log('Refreshing configuration cache...');
    try {
      await Promise.all([
        this.cacheTemplates(),
        this.cacheEventChannelMappings(),
        this.cacheProviders(),
        this.cacheEvents(),
        this.cacheChannels(),
      ]);
      this.logger.log('Configuration cache refreshed successfully');
    } catch (error) {
      this.logger.error('Failed to refresh cache:', error);
      throw error;
    }
  }

  private async cacheTemplates() {
    const result = await this.databaseService.callProcedure<TemplateCache>('get_all_templates');

    const templatesByEventChannel = new Map<string, TemplateCache>();
    for (const template of result.rows) {
      const key = `${template.event_id}:${template.channel_id}`;
      templatesByEventChannel.set(key, template);
    }

    this.cacheService.set(this.CACHE_KEYS.TEMPLATES, Object.fromEntries(templatesByEventChannel));
    this.logger.log(`Cached ${templatesByEventChannel.size} templates`);
  }

  private async cacheEventChannelMappings() {
    const result = await this.databaseService.callProcedure<EventChannelMappingCache>(
      'get_all_event_channel_mappings'
    );

    const mappingsByEvent = new Map<number, EventChannelMappingCache[]>();
    for (const mapping of result.rows) {
      if (!mappingsByEvent.has(mapping.event_id)) {
        mappingsByEvent.set(mapping.event_id, []);
      }
      mappingsByEvent.get(mapping.event_id)!.push(mapping);
    }

    this.cacheService.set(
      this.CACHE_KEYS.EVENT_CHANNEL_MAPPINGS,
      Object.fromEntries(mappingsByEvent)
    );
    this.logger.log(`Refresh Cached ${mappingsByEvent.size} event channel mappings`);
  }

  private async cacheProviders() {
    const result = await this.databaseService.callProcedure<ProviderCache>('get_all_providers');

    const providersByChannel = new Map<number, ProviderCache[]>();
    for (const provider of result.rows) {
      if (!providersByChannel.has(provider.channel_id)) {
        providersByChannel.set(provider.channel_id, []);
      }
      providersByChannel.get(provider.channel_id)!.push(provider);
    }

    this.cacheService.set(this.CACHE_KEYS.PROVIDERS, Object.fromEntries(providersByChannel));
    this.logger.log(`Cached ${providersByChannel.size} providers`);
  }

  private async cacheEvents() {
    const result = await this.databaseService.callProcedure<{ event_id: number; name: string }>(
      'get_all_events'
    );

    const eventsMap = new Map<number, string>();
    for (const event of result.rows) {
      eventsMap.set(event.event_id, event.name);
    }

    this.cacheService.set(this.CACHE_KEYS.EVENTS, Object.fromEntries(eventsMap));
    this.logger.log(`Cached ${eventsMap.size} events`);
  }

  private async cacheChannels() {
    const result = await this.databaseService.callProcedure<{
      channel_id: number;
      channel: string;
    }>('get_all_channels');

    const channelsMap = new Map<number, string>();
    for (const channel of result.rows) {
      channelsMap.set(channel.channel_id, channel.channel);
    }

    this.cacheService.set(this.CACHE_KEYS.CHANNELS, Object.fromEntries(channelsMap));
    this.logger.log(`Cached ${channelsMap.size} channels`);
  }

  async getTemplate(eventId: number, channelId: number): Promise<TemplateCache | null> {
    const cached = this.cacheService.get<Record<string, TemplateCache>>(this.CACHE_KEYS.TEMPLATES);
    if (cached) {
      const key = `${eventId}:${channelId}`;
      return cached[key] || null;
    }

    // Fallback to DB using get_all_templates and filter
    const result = await this.databaseService.callProcedure<TemplateCache>('get_all_templates');

    const template = result.rows.find((t) => t.event_id === eventId && t.channel_id === channelId);
    return template || null;
  }

  async getEventChannelMappings(eventId: number): Promise<EventChannelMappingCache[]> {
    const cached = this.cacheService.get<Record<number, EventChannelMappingCache[]>>(
      this.CACHE_KEYS.EVENT_CHANNEL_MAPPINGS
    );
    if (cached && cached[eventId]) {
      return cached[eventId];
    }

    // Fallback to DB using get_all_event_channel_mappings and filter
    const result = await this.databaseService.callProcedure<EventChannelMappingCache>(
      'get_all_event_channel_mappings'
    );

    return result.rows.filter((m) => m.event_id === eventId);
  }

  async getProvidersByChannel(channelId: number): Promise<ProviderCache[]> {
    const cached = this.cacheService.get<Record<number, ProviderCache[]>>(
      this.CACHE_KEYS.PROVIDERS
    );
    if (cached && cached[channelId]) {
      return cached[channelId];
    }

    // Fallback to DB using get_all_providers and filter
    const result = await this.databaseService.callProcedure<ProviderCache>('get_all_providers');

    return result.rows.filter((p) => p.channel_id === channelId);
  }

  async getEventInfoByName(
    eventName: string
  ): Promise<{ eventId: number; eventName: string } | null> {
    const cached = this.cacheService.get<Record<number, string>>(this.CACHE_KEYS.EVENTS);
    if (cached) {
      // Find event_id by searching through cached events
      const entry = Object.entries(cached).find(([_, name]) => name === eventName);
      if (entry) {
        const eventId = parseInt(entry[0], 10);
        return { eventId, eventName };
      }
    }

    // Fallback to DB using get_all_events and filter
    const result = await this.databaseService.callProcedure<{ event_id: number; name: string }>(
      'get_all_events'
    );

    const event = result.rows.find((e) => e.name === eventName);
    if (event) {
      return { eventId: event.event_id, eventName: event.name };
    }
    return null;
  }
}
