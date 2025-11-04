export interface ChannelMessage {
  notification_id: string;
  event_id: number;
  event_name: string;
  channel_id: number;
  channel_name: string;
  template_id: number;
  template_name: string;
  template_subject?: string;
  template_content: string;
  recipient: string;
  variables: Record<string, any>;
  metadata?: Record<string, any>;
}
