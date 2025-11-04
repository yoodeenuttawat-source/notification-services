"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.examples = void 0;
exports.sendNotification = sendNotification;
const axios_1 = __importDefault(require("axios"));
const uuid_1 = require("uuid");
const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';
async function sendNotification(payload) {
    try {
        console.log(`\n📤 Sending notification: ${payload.notification_id}`);
        console.log(`   Event Type: ${payload.event_type}`);
        console.log(`   Data:`, JSON.stringify(payload.data, null, 2));
        const response = await axios_1.default.post(`${API_BASE_URL}/notifications/send`, payload, {
            headers: {
                'Content-Type': 'application/json',
            },
        });
        console.log(`✅ Success! Status: ${response.status}`);
        console.log(`   Response:`, JSON.stringify(response.data, null, 2));
    }
    catch (error) {
        console.error(`❌ Error sending notification:`, error.message);
        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Response:`, JSON.stringify(error.response.data, null, 2));
        }
        throw error;
    }
}
const examples = {
    CHAT_MESSAGE: {
        notification_id: (0, uuid_1.v4)(),
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
        notification_id: (0, uuid_1.v4)(),
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
        notification_id: (0, uuid_1.v4)(),
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
        notification_id: (0, uuid_1.v4)(),
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
exports.examples = examples;
async function main() {
    const args = process.argv.slice(2);
    const eventType = args[0]?.toUpperCase();
    if (!eventType || !examples[eventType]) {
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
    const payload = examples[eventType];
    try {
        await sendNotification(payload);
        console.log(`\n✅ Notification sent successfully!`);
    }
    catch (error) {
        console.error(`\n❌ Failed to send notification`);
        process.exit(1);
    }
}
if (require.main === module) {
    main().catch(console.error);
}
//# sourceMappingURL=call-api.js.map