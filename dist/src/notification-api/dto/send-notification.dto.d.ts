export declare class SendNotificationDto {
    notification_id: string;
    event_type: string;
    data: Record<string, any>;
    metadata?: {
        source?: string;
        user_id?: string;
        [key: string]: any;
    };
}
