# Scripts

This directory contains utility scripts for the notification service.

## call-api.ts

A script to send notifications to the notification API.

### Usage

```bash
# Using yarn
yarn call-api <EVENT_TYPE>

# Using npm
npm run call-api <EVENT_TYPE>

# Using ts-node directly
ts-node scripts/call-api.ts <EVENT_TYPE>
```

### Available Event Types

- `CHAT_MESSAGE` - Send a chat message notification (supports both PUSH and EMAIL)
- `PURCHASE` - Send a purchase confirmation notification (supports both PUSH and EMAIL)
- `PAYMENT_REMINDER` - Send a payment reminder notification (PUSH only)
- `SHIPPING_UPDATE` - Send a shipping update notification (PUSH only)

### Examples

```bash
# Send a chat message notification
yarn call-api CHAT_MESSAGE

# Send a purchase notification
yarn call-api PURCHASE

# Send a payment reminder
yarn call-api PAYMENT_REMINDER

# Send a shipping update
yarn call-api SHIPPING_UPDATE
```

### Environment Variables

- `API_URL` - Base URL for the API (default: `http://localhost:3000`)

### Example Output

```
📤 Sending notification: 123e4567-e89b-12d3-a456-426614174000
   Event Type: CHAT_MESSAGE
   Data: {
     "sender_name": "John Doe",
     "message_preview": "Hello, how are you?",
     "user_id": "user123",
     "user_name": "Jane Doe",
     "user_email": "jane@example.com"
   }
✅ Success! Status: 202
   Response: {
     "success": true,
     "notification_id": "123e4567-e89b-12d3-a456-426614174000",
     "message": "Notification accepted and queued for processing"
   }

✅ Notification sent successfully!
```

### Prerequisites

- The API server must be running on the configured port (default: 3000)
- All workers should be running for complete message processing:
  - Notification worker (routes messages)
  - Push worker (processes push notifications)
  - Email worker (processes email notifications)

## replay-dlq.ts

A script to manually replay messages from Dead Letter Queues (DLQ).

### Usage

```bash
# Using yarn
yarn replay-dlq <DLQ_TOPIC> [LIMIT]

# Using npm
npm run replay-dlq <DLQ_TOPIC> [LIMIT]

# Using ts-node directly
ts-node scripts/replay-dlq.ts <DLQ_TOPIC> [LIMIT]
```

### Available DLQ Topics

- `notification.dlq` - Failed messages from notification worker
- `notification.push.dlq` - Failed messages from push worker
- `notification.email.dlq` - Failed messages from email worker

### Examples

```bash
# Replay all messages from notification DLQ
yarn replay-dlq notification.dlq

# Replay first 10 messages from push DLQ
yarn replay-dlq notification.push.dlq 10

# Replay first 5 messages from email DLQ
yarn replay-dlq notification.email.dlq 5
```

### How It Works

1. Connects to Kafka and creates a consumer for the specified DLQ topic
2. Reads messages from the beginning of the DLQ topic
3. Extracts the original message from each DLQ message
4. Republishes the original message to its original topic
5. Provides summary of processed, replayed, and failed messages

### Notes

- Messages are replayed from the beginning of the DLQ topic
- Use `LIMIT` parameter to control how many messages to replay
- Press Ctrl+C to stop gracefully
- Failed replays are logged but don't stop the process

