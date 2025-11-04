/**
 * Provider request/response tracking
 * Join with delivery_logs using provider_request_id
 */
export interface ProviderRequestResponse {
  provider_request_id: string; // Join key to link with delivery_logs
  notification_id: string;
  event_id: number;
  event_name: string;
  channel_id: number;
  channel_name: string;
  provider_name: string;

  // Request details (JSON string of what we actually sent to provider API)
  request: string;

  // Request headers (HTTP headers sent to provider API)
  request_header?: Record<string, string>;

  // Response details (JSON string of what provider API actually returned)
  response: string;

  timestamp: string;
  request_timestamp: string; // When we sent the request
  response_timestamp: string; // When we got the response
}
