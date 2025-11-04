import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from './config.service';
import { CacheService } from './cache.service';
import { DatabaseService } from '../database/database.service';

describe('ConfigService', () => {
  let service: ConfigService;
  let cacheService: CacheService;
  let databaseService: DatabaseService;

  const mockDatabaseService = {
    callProcedure: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfigService,
        CacheService,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    service = module.get<ConfigService>(ConfigService);
    cacheService = module.get<CacheService>(CacheService);
    databaseService = module.get<DatabaseService>(DatabaseService);

    // Clear cache and mocks before each test
    cacheService.delete('config:templates');
    cacheService.delete('config:event_channel_mappings');
    cacheService.delete('config:providers');
    cacheService.delete('config:events');
    cacheService.delete('config:channels');
    jest.clearAllMocks();
  });

  describe('getTemplate', () => {
    it('should return template from cache when available', async () => {
      const mockTemplate = {
        template_id: 1,
        event_id: 1,
        channel_id: 1,
        name: 'Test Template',
        content: 'Test content',
        variables: {},
        required_fields: [],
      };

      cacheService.set('config:templates', {
        '1:1': mockTemplate,
      });

      const result = await service.getTemplate(1, 1);
      expect(result).toEqual(mockTemplate);
      expect(databaseService.callProcedure).not.toHaveBeenCalled();
    });

    it('should return null when template not in cache', async () => {
      // Don't set cache, so it will fallback to DB
      cacheService.delete('config:templates');

      mockDatabaseService.callProcedure.mockResolvedValue({
        rows: [],
      });

      const result = await service.getTemplate(1, 1);
      expect(result).toBeNull();
      expect(databaseService.callProcedure).toHaveBeenCalledWith('get_all_templates');
    });

    it('should fallback to database when cache miss', async () => {
      const mockTemplate = {
        template_id: 1,
        event_id: 1,
        channel_id: 1,
        name: 'Test Template',
        content: 'Test content',
        variables: {},
        required_fields: [],
      };

      mockDatabaseService.callProcedure.mockResolvedValue({
        rows: [mockTemplate],
      });

      const result = await service.getTemplate(1, 1);
      expect(result).toEqual(mockTemplate);
      expect(databaseService.callProcedure).toHaveBeenCalledWith('get_all_templates');
    });

    it('should return null when template not found in database', async () => {
      cacheService.delete('config:templates');

      mockDatabaseService.callProcedure.mockResolvedValue({
        rows: [
          {
            template_id: 2,
            event_id: 1,
            channel_id: 2,
            name: 'Other Template',
            content: 'Other content',
            variables: {},
            required_fields: [],
          },
        ],
      });

      const result = await service.getTemplate(1, 1);
      expect(result).toBeNull();
    });
  });

  describe('getEventChannelMappings', () => {
    it('should return mappings from cache when available', async () => {
      const mockMappings = [
        { event_id: 1, event_name: 'TEST', channel_id: 1, channel_name: 'EMAIL' },
        { event_id: 1, event_name: 'TEST', channel_id: 2, channel_name: 'PUSH' },
      ];

      cacheService.set('config:event_channel_mappings', {
        1: mockMappings,
      });

      const result = await service.getEventChannelMappings(1);
      expect(result).toEqual(mockMappings);
      expect(databaseService.callProcedure).not.toHaveBeenCalled();
    });

    it('should return empty array when event not in cache', async () => {
      // Set cache with a different event_id to ensure event 1 is not in cache
      cacheService.set('config:event_channel_mappings', {
        999: [{ event_id: 999, event_name: 'OTHER', channel_id: 1, channel_name: 'EMAIL' }],
      });

      // Mock DB call to return empty (should fallback to DB)
      mockDatabaseService.callProcedure.mockResolvedValue({
        rows: [],
      });

      const result = await service.getEventChannelMappings(1);
      expect(result).toEqual([]);
      // Should fallback to DB when event not found in cache
      expect(databaseService.callProcedure).toHaveBeenCalledWith('get_all_event_channel_mappings');
    });

    it('should fallback to database when cache miss', async () => {
      const mockMappings = [
        { event_id: 1, event_name: 'TEST', channel_id: 1, channel_name: 'EMAIL' },
      ];

      cacheService.delete('config:event_channel_mappings');

      mockDatabaseService.callProcedure.mockResolvedValue({
        rows: mockMappings,
      });

      const result = await service.getEventChannelMappings(1);
      expect(result).toEqual(mockMappings);
      expect(databaseService.callProcedure).toHaveBeenCalledWith('get_all_event_channel_mappings');
    });

    it('should filter mappings by event_id', async () => {
      cacheService.delete('config:event_channel_mappings');

      mockDatabaseService.callProcedure.mockResolvedValue({
        rows: [
          { event_id: 1, event_name: 'TEST', channel_id: 1, channel_name: 'EMAIL' },
          { event_id: 2, event_name: 'OTHER', channel_id: 1, channel_name: 'EMAIL' },
        ],
      });

      const result = await service.getEventChannelMappings(1);
      expect(result).toHaveLength(1);
      expect(result[0].event_id).toBe(1);
    });
  });

  describe('getProvidersByChannel', () => {
    it('should return providers from cache when available', async () => {
      const mockProviders = [
        { provider_id: 1, name: 'EmailProvider1', channel_id: 1, priority: 1 },
      ];

      cacheService.set('config:providers', {
        1: mockProviders,
      });

      const result = await service.getProvidersByChannel(1);
      expect(result).toEqual(mockProviders);
      expect(databaseService.callProcedure).not.toHaveBeenCalled();
    });

    it('should return empty array when channel not in cache', async () => {
      // Set cache with a different channel_id to ensure channel 1 is not in cache
      cacheService.set('config:providers', {
        999: [{ provider_id: 2, name: 'PushProvider1', channel_id: 999, priority: 1 }],
      });

      // Mock DB call to return empty (should not be called though)
      mockDatabaseService.callProcedure.mockResolvedValue({
        rows: [],
      });

      const result = await service.getProvidersByChannel(1);
      expect(result).toEqual([]);
      // Should fallback to DB when channel not found in cache
      expect(databaseService.callProcedure).toHaveBeenCalledWith('get_all_providers');
    });

    it('should fallback to database when cache miss', async () => {
      const mockProviders = [
        { provider_id: 1, name: 'EmailProvider1', channel_id: 1, priority: 1 },
      ];

      cacheService.delete('config:providers');

      mockDatabaseService.callProcedure.mockResolvedValue({
        rows: mockProviders,
      });

      const result = await service.getProvidersByChannel(1);
      expect(result).toEqual(mockProviders);
      expect(databaseService.callProcedure).toHaveBeenCalledWith('get_all_providers');
    });

    it('should filter providers by channel_id', async () => {
      cacheService.delete('config:providers');

      mockDatabaseService.callProcedure.mockResolvedValue({
        rows: [
          { provider_id: 1, name: 'EmailProvider1', channel_id: 1, priority: 1 },
          { provider_id: 2, name: 'PushProvider1', channel_id: 2, priority: 1 },
        ],
      });

      const result = await service.getProvidersByChannel(1);
      expect(result).toHaveLength(1);
      expect(result[0].channel_id).toBe(1);
    });
  });

  describe('getEventInfoByName', () => {
    it('should return event info from cache when available', async () => {
      cacheService.set('config:events', {
        1: 'CHAT_MESSAGE',
        2: 'PURCHASE',
      });

      const result = await service.getEventInfoByName('CHAT_MESSAGE');
      expect(result).toEqual({ eventId: 1, eventName: 'CHAT_MESSAGE' });
      expect(databaseService.callProcedure).not.toHaveBeenCalled();
    });

    it('should return null when event not found in cache', async () => {
      cacheService.set('config:events', {});

      mockDatabaseService.callProcedure.mockResolvedValue({
        rows: [],
      });

      const result = await service.getEventInfoByName('UNKNOWN');
      expect(result).toBeNull();
      expect(databaseService.callProcedure).toHaveBeenCalledWith('get_all_events');
    });

    it('should fallback to database when cache miss', async () => {
      const mockEvent = { event_id: 1, name: 'CHAT_MESSAGE' };

      cacheService.delete('config:events');

      mockDatabaseService.callProcedure.mockResolvedValue({
        rows: [mockEvent],
      });

      const result = await service.getEventInfoByName('CHAT_MESSAGE');
      expect(result).toEqual({ eventId: 1, eventName: 'CHAT_MESSAGE' });
      expect(databaseService.callProcedure).toHaveBeenCalledWith('get_all_events');
    });

    it('should return null when event not found in database', async () => {
      cacheService.delete('config:events');

      mockDatabaseService.callProcedure.mockResolvedValue({
        rows: [{ event_id: 1, name: 'OTHER_EVENT' }],
      });

      const result = await service.getEventInfoByName('UNKNOWN');
      expect(result).toBeNull();
    });
  });

  describe('refreshCache', () => {
    it('should cache all configuration data', async () => {
      mockDatabaseService.callProcedure.mockImplementation((procedureName: string) => {
        if (procedureName === 'get_all_templates') {
          return Promise.resolve({
            rows: [
              {
                template_id: 1,
                event_id: 1,
                channel_id: 1,
                name: 'Template',
                content: 'Content',
                variables: {},
                required_fields: [],
              },
            ],
          });
        }
        if (procedureName === 'get_all_event_channel_mappings') {
          return Promise.resolve({
            rows: [{ event_id: 1, event_name: 'TEST', channel_id: 1, channel_name: 'EMAIL' }],
          });
        }
        if (procedureName === 'get_all_providers') {
          return Promise.resolve({
            rows: [{ provider_id: 1, name: 'EmailProvider1', channel_id: 1, priority: 1 }],
          });
        }
        if (procedureName === 'get_all_events') {
          return Promise.resolve({
            rows: [{ event_id: 1, name: 'CHAT_MESSAGE' }],
          });
        }
        if (procedureName === 'get_all_channels') {
          return Promise.resolve({
            rows: [{ channel_id: 1, channel: 'EMAIL' }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      await service.refreshCache();

      // Verify all caches were populated
      expect(cacheService.get('config:templates')).toBeDefined();
      expect(cacheService.get('config:event_channel_mappings')).toBeDefined();
      expect(cacheService.get('config:providers')).toBeDefined();
      expect(cacheService.get('config:events')).toBeDefined();
      expect(cacheService.get('config:channels')).toBeDefined();
    });

    it('should throw error when refresh fails', async () => {
      mockDatabaseService.callProcedure.mockRejectedValue(new Error('Database error'));

      await expect(service.refreshCache()).rejects.toThrow('Database error');
    });

    it('should handle multiple templates correctly', async () => {
      mockDatabaseService.callProcedure.mockImplementation((procedureName: string) => {
        if (procedureName === 'get_all_templates') {
          return Promise.resolve({
            rows: [
              {
                template_id: 1,
                event_id: 1,
                channel_id: 1,
                name: 'Template1',
                content: 'Content1',
                variables: {},
                required_fields: [],
              },
              {
                template_id: 2,
                event_id: 1,
                channel_id: 2,
                name: 'Template2',
                content: 'Content2',
                variables: {},
                required_fields: [],
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      await service.refreshCache();

      const templates = cacheService.get<Record<string, any>>('config:templates');
      expect(templates).toBeDefined();
      expect(templates!['1:1']).toBeDefined();
      expect(templates!['1:2']).toBeDefined();
    });

    it('should handle refreshCache failure in onModuleInit', async () => {
      mockDatabaseService.callProcedure.mockRejectedValue(new Error('Database error'));

      // Create new service instance to test onModuleInit
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ConfigService,
          CacheService,
          {
            provide: DatabaseService,
            useValue: mockDatabaseService,
          },
        ],
      }).compile();

      const newService = module.get<ConfigService>(ConfigService);

      // onModuleInit should throw on failure
      await expect(newService.onModuleInit()).rejects.toThrow('Database error');
    });

    it('should log success message on successful initialization', async () => {
      mockDatabaseService.callProcedure.mockImplementation((procedureName: string) => {
        return Promise.resolve({ rows: [] });
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ConfigService,
          CacheService,
          {
            provide: DatabaseService,
            useValue: mockDatabaseService,
          },
        ],
      }).compile();

      const newService = module.get<ConfigService>(ConfigService);

      // This should succeed and log success message
      await newService.onModuleInit();

      expect(mockDatabaseService.callProcedure).toHaveBeenCalled();
    });

    it('should handle refreshCachePeriodically success', async () => {
      mockDatabaseService.callProcedure.mockImplementation((procedureName: string) => {
        if (procedureName === 'get_all_templates') {
          return Promise.resolve({ rows: [] });
        }
        if (procedureName === 'get_all_event_channel_mappings') {
          return Promise.resolve({ rows: [] });
        }
        if (procedureName === 'get_all_providers') {
          return Promise.resolve({ rows: [] });
        }
        if (procedureName === 'get_all_events') {
          return Promise.resolve({ rows: [] });
        }
        if (procedureName === 'get_all_channels') {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      // Call refreshCachePeriodically directly
      await service.refreshCachePeriodically();

      // Should not throw
      expect(mockDatabaseService.callProcedure).toHaveBeenCalled();
    });

    it('should handle refreshCachePeriodically failure gracefully', async () => {
      mockDatabaseService.callProcedure.mockRejectedValue(new Error('Periodic refresh failed'));

      // Should not throw, just log error
      await expect(service.refreshCachePeriodically()).resolves.not.toThrow();
    });
  });
});
