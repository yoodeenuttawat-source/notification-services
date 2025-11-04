export interface RenderedTemplate {
    channel_id: number;
    channel_name: string;
    template_id: number;
    template_name: string;
    subject?: string;
    content: string;
    recipient: string;
}
export interface NotificationMessage {
    notification_id: string;
    event_id: number;
    event_name: string;
    rendered_templates: RenderedTemplate[];
    data: Record<string, any>;
    metadata?: {
        source?: string;
        user_id?: string;
        timestamp?: string;
    };
}
