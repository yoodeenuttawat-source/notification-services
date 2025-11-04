import { Test, TestingModule } from '@nestjs/testing';
import { NotificationApiController } from './notification-api.controller';
import { NotificationApiService } from './notification-api.service';
import { SendNotificationDto } from './dto/send-notification.dto';

describe('NotificationApiController', () => {
  let controller: NotificationApiController;
  let service: NotificationApiService;

  const mockNotificationApiService = {
    sendNotification: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationApiController],
      providers: [
        {
          provide: NotificationApiService,
          useValue: mockNotificationApiService,
        },
      ],
    }).compile();

    controller = module.get<NotificationApiController>(NotificationApiController);
    service = module.get<NotificationApiService>(NotificationApiService);

    jest.clearAllMocks();
  });

  describe('health', () => {
    it('should return health status', () => {
      const result = controller.health();
      
      expect(result).toEqual({
        status: 'ok',
        service: 'notification-api',
        timestamp: expect.any(String)
      });
      
      // Verify timestamp is valid ISO string
      expect(() => new Date(result.timestamp)).not.toThrow();
    });

    it('should return current timestamp', () => {
      const before = Date.now();
      const result = controller.health();
      const after = Date.now();
      
      const timestamp = new Date(result.timestamp).getTime();
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('sendNotification', () => {
    it('should call service and return success response', async () => {
      const dto: SendNotificationDto = {
        notification_id: 'test-123',
        event_type: 'CHAT_MESSAGE',
        data: {
          sender_name: 'John',
          message_preview: 'Hello',
          user_id: 'user123',
          user_email: 'user@example.com'
        }
      };

      const result = await controller.sendNotification(dto);

      expect(service.sendNotification).toHaveBeenCalledWith(dto);
      expect(result).toEqual({
        success: true,
        notification_id: 'test-123',
        message: 'Notification accepted and queued for processing'
      });
    });

    it('should propagate errors from service', async () => {
      const dto: SendNotificationDto = {
        notification_id: 'test-123',
        event_type: 'UNKNOWN',
        data: {}
      };

      const error = new Error('Event type not found');
      mockNotificationApiService.sendNotification.mockRejectedValue(error);

      await expect(controller.sendNotification(dto)).rejects.toThrow(error);
      expect(service.sendNotification).toHaveBeenCalledWith(dto);
    });
  });
});

