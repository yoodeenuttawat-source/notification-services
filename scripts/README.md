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

