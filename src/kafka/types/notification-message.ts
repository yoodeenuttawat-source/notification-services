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
  rendered_templates: RenderedTemplate[]; // Pre-rendered templates for each channel
  data: Record<string, any>; // Original template substitution data (kept for reference)
  metadata?: {
    source?: string; // 'order_service', 'chat_service', etc.
    user_id?: string;
    timestamp?: string;
  };
}
