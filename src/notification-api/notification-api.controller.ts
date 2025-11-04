import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { NotificationApiService } from './notification-api.service';
import { SendNotificationDto } from './dto/send-notification.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';

@Controller('notifications')
export class NotificationApiController {
  constructor(private readonly notificationApiService: NotificationApiService) {}

  @Post('send')
  @HttpCode(HttpStatus.ACCEPTED)
  async sendNotification(@Body() dto: SendNotificationDto): Promise<NotificationResponseDto> {
    await this.notificationApiService.sendNotification(dto);
    
    return {
      success: true,
      notification_id: dto.notification_id,
      message: 'Notification accepted and queued for processing'
    };
  }
}
