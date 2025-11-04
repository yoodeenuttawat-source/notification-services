import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { NotificationApiService } from './notification-api.service';
import { KafkaService } from '../kafka/kafka.service';
import { ConfigService } from '../cache/config.service';
import { DatabaseService } from '../database/database.service';
import { KAFKA_TOPICS } from '../kafka/kafka.config';

describe('NotificationApiService', () => {
  let service: NotificationApiService;
  let kafkaService: KafkaService;
  let configService: ConfigService;
  let databaseService: DatabaseService;

  const mockKafkaService = {
    publishMessage: jest.fn().mockResolvedValue(undefined),
  };

  const mockConfigService = {
    getEventInfoByName: jest.fn(),
    getEventChannelMappings: jest.fn(),
    getTemplate: jest.fn(),
  };

  const mockDatabaseService = {
    callProcedure: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationApiService,
        {
          provide: KafkaService,
          useValue: mockKafkaService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    service = module.get<NotificationApiService>(NotificationApiService);
    kafkaService = module.get<KafkaService>(KafkaService);
    configService = module.get<ConfigService>(ConfigService);
    databaseService = module.get<DatabaseService>(DatabaseService);

    jest.clearAllMocks();
  });

  describe('sendNotification', () => {
    it('should successfully send notification', async () => {
      const dto = {
        notification_id: 'test-123',
        event_type: 'CHAT_MESSAGE',
        data: {
          sender_name: 'John',
          message_preview: 'Hello',
          user_id: 'user123',
          user_email: 'user@example.com'
        }
      };

      mockConfigService.getEventInfoByName.mockResolvedValue({
        eventId: 1,
        eventName: 'CHAT_MESSAGE'
      });

      mockConfigService.getEventChannelMappings.mockResolvedValue([
        { event_id: 1, event_name: 'CHAT_MESSAGE', channel_id: 1, channel_name: 'EMAIL' }
      ]);

      mockConfigService.getTemplate.mockResolvedValue({
        template_id: 1,
        event_id: 1,
        channel_id: 1,
        name: 'Chat Email Template',
        subject: 'New message from {{sender_name}}',
        content: 'Message: {{message_preview}}',
        variables: {},
        required_fields: ['sender_name', 'message_preview', 'user_email']
      });

      await service.sendNotification(dto);

      expect(kafkaService.publishMessage).toHaveBeenCalledWith(
        KAFKA_TOPICS.NOTIFICATION,
        expect.arrayContaining([
          expect.objectContaining({
            key: 'test-123',
            value: expect.objectContaining({
              notification_id: 'test-123',
              event_name: 'CHAT_MESSAGE',
              rendered_templates: expect.arrayContaining([
                expect.objectContaining({
                  channel_name: 'EMAIL',
                  recipient: 'user@example.com',
                  subject: 'New message from John',
                  content: 'Message: Hello'
                })
              ])
            })
          })
        ])
      );
    });

    it('should throw NotFoundException when event type not found', async () => {
      const dto = {
        notification_id: 'test-123',
        event_type: 'UNKNOWN_EVENT',
        data: {}
      };

      mockConfigService.getEventInfoByName.mockResolvedValue(null);

      await expect(service.sendNotification(dto)).rejects.toThrow(NotFoundException);
      await expect(service.sendNotification(dto)).rejects.toThrow("Event type 'UNKNOWN_EVENT' not found");
    });

    it('should throw BadRequestException when no channels configured', async () => {
      const dto = {
        notification_id: 'test-123',
        event_type: 'CHAT_MESSAGE',
        data: {}
      };

      mockConfigService.getEventInfoByName.mockResolvedValue({
        eventId: 1,
        eventName: 'CHAT_MESSAGE'
      });

      mockConfigService.getEventChannelMappings.mockResolvedValue([]);

      await expect(service.sendNotification(dto)).rejects.toThrow(BadRequestException);
      await expect(service.sendNotification(dto)).rejects.toThrow("No channels configured for event type 'CHAT_MESSAGE'");
    });

    it('should throw BadRequestException when required fields are missing', async () => {
      const dto = {
        notification_id: 'test-123',
        event_type: 'CHAT_MESSAGE',
        data: {
          sender_name: 'John'
          // Missing message_preview and user_email
        }
      };

      mockConfigService.getEventInfoByName.mockResolvedValue({
        eventId: 1,
        eventName: 'CHAT_MESSAGE'
      });

      mockConfigService.getEventChannelMappings.mockResolvedValue([
        { event_id: 1, event_name: 'CHAT_MESSAGE', channel_id: 1, channel_name: 'EMAIL' }
      ]);

      mockConfigService.getTemplate.mockResolvedValue({
        template_id: 1,
        event_id: 1,
        channel_id: 1,
        name: 'Chat Email Template',
        content: 'Test',
        variables: {},
        required_fields: ['sender_name', 'message_preview', 'user_email']
      });

      await expect(service.sendNotification(dto)).rejects.toThrow(BadRequestException);
      await expect(service.sendNotification(dto)).rejects.toThrow('Missing required fields for EMAIL channel');
    });

    it('should skip channel when template not found', async () => {
      const dto = {
        notification_id: 'test-123',
        event_type: 'CHAT_MESSAGE',
        data: {
          sender_name: 'John',
          message_preview: 'Hello',
          user_id: 'user123'
        }
      };

      mockConfigService.getEventInfoByName.mockResolvedValue({
        eventId: 1,
        eventName: 'CHAT_MESSAGE'
      });

      mockConfigService.getEventChannelMappings.mockResolvedValue([
        { event_id: 1, event_name: 'CHAT_MESSAGE', channel_id: 1, channel_name: 'PUSH' }
      ]);

      mockConfigService.getTemplate.mockResolvedValue(null);

      await expect(service.sendNotification(dto)).rejects.toThrow(BadRequestException);
      await expect(service.sendNotification(dto)).rejects.toThrow('No valid templates could be rendered');
    });

    it('should skip channel when recipient not found', async () => {
      const dto = {
        notification_id: 'test-123',
        event_type: 'CHAT_MESSAGE',
        data: {
          sender_name: 'John',
          message_preview: 'Hello'
          // Missing user_email
        }
      };

      mockConfigService.getEventInfoByName.mockResolvedValue({
        eventId: 1,
        eventName: 'CHAT_MESSAGE'
      });

      mockConfigService.getEventChannelMappings.mockResolvedValue([
        { event_id: 1, event_name: 'CHAT_MESSAGE', channel_id: 1, channel_name: 'EMAIL' }
      ]);

      mockConfigService.getTemplate.mockResolvedValue({
        template_id: 1,
        event_id: 1,
        channel_id: 1,
        name: 'Chat Email Template',
        content: 'Test',
        variables: {},
        required_fields: ['sender_name', 'message_preview']
      });

      await expect(service.sendNotification(dto)).rejects.toThrow(BadRequestException);
    });

    it('should render templates with variable substitution', async () => {
      const dto = {
        notification_id: 'test-123',
        event_type: 'CHAT_MESSAGE',
        data: {
          sender_name: 'John Doe',
          message_preview: 'Hello World',
          user_id: 'user123'
        }
      };

      mockConfigService.getEventInfoByName.mockResolvedValue({
        eventId: 1,
        eventName: 'CHAT_MESSAGE'
      });

      mockConfigService.getEventChannelMappings.mockResolvedValue([
        { event_id: 1, event_name: 'CHAT_MESSAGE', channel_id: 1, channel_name: 'PUSH' }
      ]);

      mockConfigService.getTemplate.mockResolvedValue({
        template_id: 1,
        event_id: 1,
        channel_id: 1,
        name: 'Chat Push Template',
        content: '{{sender_name}}: {{message_preview}}',
        variables: {},
        required_fields: ['sender_name', 'message_preview', 'user_id']
      });

      await service.sendNotification(dto);

      expect(kafkaService.publishMessage).toHaveBeenCalledWith(
        KAFKA_TOPICS.NOTIFICATION,
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              rendered_templates: expect.arrayContaining([
                expect.objectContaining({
                  content: 'John Doe: Hello World'
                })
              ])
            })
          })
        ])
      );
    });

    it('should handle multiple channels', async () => {
      const dto = {
        notification_id: 'test-123',
        event_type: 'CHAT_MESSAGE',
        data: {
          sender_name: 'John',
          message_preview: 'Hello',
          user_id: 'user123',
          user_email: 'user@example.com'
        }
      };

      mockConfigService.getEventInfoByName.mockResolvedValue({
        eventId: 1,
        eventName: 'CHAT_MESSAGE'
      });

      mockConfigService.getEventChannelMappings.mockResolvedValue([
        { event_id: 1, event_name: 'CHAT_MESSAGE', channel_id: 1, channel_name: 'EMAIL' },
        { event_id: 1, event_name: 'CHAT_MESSAGE', channel_id: 2, channel_name: 'PUSH' }
      ]);

      mockConfigService.getTemplate
        .mockResolvedValueOnce({
          template_id: 1,
          event_id: 1,
          channel_id: 1,
          name: 'Email Template',
          subject: 'Test',
          content: 'Content',
          variables: {},
          required_fields: ['user_email']
        })
        .mockResolvedValueOnce({
          template_id: 2,
          event_id: 1,
          channel_id: 2,
          name: 'Push Template',
          content: 'Content',
          variables: {},
          required_fields: ['user_id']
        });

      await service.sendNotification(dto);

      expect(kafkaService.publishMessage).toHaveBeenCalled();
      const callArgs = (kafkaService.publishMessage as jest.Mock).mock.calls[0];
      const message = callArgs[1][0].value;
      expect(message.rendered_templates).toHaveLength(2);
      expect(message.rendered_templates.some(t => t.channel_name === 'EMAIL')).toBe(true);
      expect(message.rendered_templates.some(t => t.channel_name === 'PUSH')).toBe(true);
    });
  });

  describe('getRecipient', () => {
    it('should get email recipient from user_email', () => {
      const data = { user_email: 'test@example.com' };
      const recipient = service['getRecipient'](data, 'EMAIL');
      expect(recipient).toBe('test@example.com');
    });

    it('should get email recipient from email field', () => {
      const data = { email: 'test@example.com' };
      const recipient = service['getRecipient'](data, 'EMAIL');
      expect(recipient).toBe('test@example.com');
    });

    it('should get email recipient from recipient field', () => {
      const data = { recipient: 'fallback@example.com' };
      const recipient = service['getRecipient'](data, 'EMAIL');
      expect(recipient).toBe('fallback@example.com');
    });

    it('should prioritize user_email over email for email channel', () => {
      const data = { user_email: 'user@example.com', email: 'other@example.com' };
      const recipient = service['getRecipient'](data, 'EMAIL');
      expect(recipient).toBe('user@example.com');
    });

    it('should get push recipient from user_id', () => {
      const data = { user_id: 'user123' };
      const recipient = service['getRecipient'](data, 'PUSH');
      expect(recipient).toBe('user123');
    });

    it('should get push recipient from device_token', () => {
      const data = { device_token: 'token123' };
      const recipient = service['getRecipient'](data, 'PUSH');
      expect(recipient).toBe('token123');
    });

    it('should get push recipient from recipient field', () => {
      const data = { recipient: 'user123' };
      const recipient = service['getRecipient'](data, 'PUSH');
      expect(recipient).toBe('user123');
    });

    it('should prioritize user_id over device_token for push channel', () => {
      const data = { user_id: 'user123', device_token: 'token456' };
      const recipient = service['getRecipient'](data, 'PUSH');
      expect(recipient).toBe('user123');
    });

    it('should handle unknown channel type', () => {
      const data = { user_id: 'user123', recipient: 'fallback' };
      const recipient = service['getRecipient'](data, 'UNKNOWN');
      expect(recipient).toBe('user123');
    });

    it('should return null when no recipient found', () => {
      const data = {};
      const recipient = service['getRecipient'](data, 'EMAIL');
      expect(recipient).toBeNull();
    });

    it('should handle case-insensitive channel names', () => {
      const data = { user_email: 'test@example.com' };
      expect(service['getRecipient'](data, 'email')).toBe('test@example.com');
      expect(service['getRecipient'](data, 'Email')).toBe('test@example.com');
      expect(service['getRecipient'](data, 'EMAIL')).toBe('test@example.com');
    });
  });

  describe('substituteVariables', () => {
    it('should substitute variables in template', () => {
      const template = 'Hello {{name}}, your order is {{order_id}}';
      const data = { name: 'John', order_id: 'ORD123' };
      const result = service['substituteVariables'](template, data);
      expect(result).toBe('Hello John, your order is ORD123');
    });

    it('should leave unmatched variables unchanged', () => {
      const template = 'Hello {{name}}, status: {{status}}';
      const data = { name: 'John' };
      const result = service['substituteVariables'](template, data);
      expect(result).toBe('Hello John, status: {{status}}');
    });

    it('should handle numeric values', () => {
      const template = 'Amount: {{amount}}';
      const data = { amount: 99.99 };
      const result = service['substituteVariables'](template, data);
      expect(result).toBe('Amount: 99.99');
    });
  });
});

