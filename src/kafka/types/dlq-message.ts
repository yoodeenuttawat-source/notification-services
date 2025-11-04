/**
 * Dead Letter Queue message structure
 */
export interface DLQMessage<T = any> {
  originalMessage: T;
  originalTopic: string;
  originalKey?: string;
  error: {
    message: string;
    stack?: string;
    type?: string;
  };
  retryCount: number;
  maxRetries: number;
  timestamp: string;
  metadata?: {
    notification_id?: string;
    event_name?: string;
    channel_name?: string;
    [key: string]: any;
  };
}

