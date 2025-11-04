interface NotificationPayload {
    notification_id: string;
    event_type: string;
    data: Record<string, any>;
    metadata?: {
        source?: string;
        user_id?: string;
        [key: string]: any;
    };
}
declare function sendNotification(payload: NotificationPayload): Promise<void>;
declare const examples: {
    CHAT_MESSAGE: {
        notification_id: string;
        event_type: string;
        data: {
            sender_name: string;
            message_preview: string;
            user_id: string;
            user_name: string;
            user_email: string;
        };
        metadata: {
            source: string;
            user_id: string;
        };
    };
    PURCHASE: {
        notification_id: string;
        event_type: string;
        data: {
            order_id: string;
            user_id: string;
            user_name: string;
            total_amount: number;
            user_email: string;
        };
        metadata: {
            source: string;
            user_id: string;
        };
    };
    PAYMENT_REMINDER: {
        notification_id: string;
        event_type: string;
        data: {
            order_id: string;
            user_id: string;
        };
        metadata: {
            source: string;
            user_id: string;
        };
    };
    SHIPPING_UPDATE: {
        notification_id: string;
        event_type: string;
        data: {
            order_id: string;
            status: string;
            user_id: string;
        };
        metadata: {
            source: string;
            user_id: string;
        };
    };
};
export { sendNotification, examples };
