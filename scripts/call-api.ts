import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';

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

/**
 * Send a notification to the API
 */
async function sendNotification(payload: NotificationPayload): Promise<void> {
  try {
    console.log(`\n📤 Sending notification: ${payload.notification_id}`);
    console.log(`   Event Type: ${payload.event_type}`);
    console.log(`   Data:`, JSON.stringify(payload.data, null, 2));

    const response = await axios.post(`${API_BASE_URL}/notifications/send`, payload, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log(`✅ Success! Status: ${response.status}`);
    console.log(`   Response:`, JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    console.error(`❌ Error sending notification:`, error.message);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Response:`, JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

/**
 * Example notifications for different event types
 */
const examples = {
  CHAT_MESSAGE: {
    notification_id: uuidv4(),
    event_type: 'CHAT_MESSAGE',
    data: {
      sender_name: 'John Doe',
      message_preview: 'Hello, how are you?',
      user_id: 'user123',
      user_name: 'Jane Doe',
      user_email: 'jane@example.com',
    },
    metadata: {
      source: 'chat_service',
      user_id: 'user123',
    },
  },

  PURCHASE: {
    notification_id: uuidv4(),
    event_type: 'PURCHASE',
    data: {
      order_id: 'ORD123',
      user_id: 'user123',
      user_name: 'Jane Doe',
      total_amount: 99.99,
      user_email: 'jane@example.com',
    },
    metadata: {
      source: 'order_service',
      user_id: 'user123',
    },
  },

  PAYMENT_REMINDER: {
    notification_id: uuidv4(),
    event_type: 'PAYMENT_REMINDER',
    data: {
      order_id: 'ORD123',
      user_id: 'user123',
    },
    metadata: {
      source: 'payment_service',
      user_id: 'user123',
    },
  },

  SHIPPING_UPDATE: {
    notification_id: uuidv4(),
    event_type: 'SHIPPING_UPDATE',
    data: {
      order_id: 'ORD123',
      status: 'shipped',
      user_id: 'user123',
    },
    metadata: {
      source: 'shipping_service',
      user_id: 'user123',
    },
  },
};

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const eventType = args[0]?.toUpperCase();

  if (!eventType || !examples[eventType as keyof typeof examples]) {
    console.log('Usage: ts-node scripts/call-api.ts <EVENT_TYPE>');
    console.log('\nAvailable event types:');
    console.log('  - CHAT_MESSAGE');
    console.log('  - PURCHASE');
    console.log('  - PAYMENT_REMINDER');
    console.log('  - SHIPPING_UPDATE');
    console.log('\nExample:');
    console.log('  ts-node scripts/call-api.ts CHAT_MESSAGE');
    process.exit(1);
  }

  const payload = examples[eventType as keyof typeof examples];

  try {
    await sendNotification(payload);
    console.log(`\n✅ Notification sent successfully!`);
  } catch (error) {
    console.error(`\n❌ Failed to send notification`);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { sendNotification, examples };
