import { NotificationApiService } from './notification-api.service';
import { SendNotificationDto } from './dto/send-notification.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';
export declare class NotificationApiController {
    private readonly notificationApiService;
    constructor(notificationApiService: NotificationApiService);
    sendNotification(dto: SendNotificationDto): Promise<NotificationResponseDto>;
}
