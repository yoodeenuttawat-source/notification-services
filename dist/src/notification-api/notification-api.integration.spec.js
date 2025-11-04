"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const common_1 = require("@nestjs/common");
const supertest_1 = __importDefault(require("supertest"));
const notification_api_module_1 = require("./notification-api.module");
const kafka_test_helper_1 = require("../test/kafka-test-helper");
const kafka_config_1 = require("../kafka/kafka.config");
describe('NotificationApi Integration Tests (e2e)', () => {
    let app;
    let kafkaHelper;
    beforeAll(async () => {
        kafkaHelper = new kafka_test_helper_1.KafkaTestHelper();
        await kafkaHelper.createConsumerForTopic(kafka_config_1.KAFKA_TOPICS.NOTIFICATION, 'test-notification-consumer');
        await kafkaHelper.createConsumerForTopic(kafka_config_1.KAFKA_TOPICS.PUSH_NOTIFICATION, 'test-push-consumer');
        await kafkaHelper.createConsumerForTopic(kafka_config_1.KAFKA_TOPICS.EMAIL_NOTIFICATION, 'test-email-consumer');
        await kafkaHelper.createConsumerForTopic(kafka_config_1.KAFKA_TOPICS.DELIVERY_LOGS, 'test-delivery-logs-consumer');
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const moduleFixture = await testing_1.Test.createTestingModule({
            imports: [notification_api_module_1.NotificationApiModule],
        }).compile();
        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new common_1.ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }));
        await app.init();
    });
    afterAll(async () => {
        await kafkaHelper.disconnectAll();
        await app.close();
    });
    beforeEach(() => {
        kafkaHelper.clearAllMessages();
    });
    describe('POST /notifications/send', () => {
        it('should publish CHAT_MESSAGE to notification topic with both PUSH and EMAIL channels', async () => {
            const notificationId = `test-chat-${Date.now()}`;
            const payload = {
                notification_id: notificationId,
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
            };
            const response = await (0, supertest_1.default)(app.getHttpServer())
                .post('/notifications/send')
                .send(payload)
                .expect(202);
            expect(response.body).toEqual({
                success: true,
                notification_id: notificationId,
                message: 'Notification accepted and queued for processing',
            });
            const notificationMessage = await kafkaHelper.waitForMessage(kafka_config_1.KAFKA_TOPICS.NOTIFICATION, 10000, (msg) => msg.value?.notification_id === notificationId);
            expect(notificationMessage).toBeTruthy();
            expect(notificationMessage?.topic).toBe(kafka_config_1.KAFKA_TOPICS.NOTIFICATION);
            expect(notificationMessage?.key).toBe(notificationId);
            expect(notificationMessage?.value).toMatchObject({
                notification_id: notificationId,
                event_name: 'CHAT_MESSAGE',
                event_id: expect.any(Number),
                rendered_templates: expect.any(Array),
            });
            const messageValue = notificationMessage?.value;
            expect(messageValue.rendered_templates).toHaveLength(2);
            expect(messageValue.rendered_templates.some((t) => t.channel_name === 'PUSH')).toBe(true);
            expect(messageValue.rendered_templates.some((t) => t.channel_name === 'EMAIL')).toBe(true);
            const pushMessage = await kafkaHelper.waitForMessage(kafka_config_1.KAFKA_TOPICS.PUSH_NOTIFICATION, 15000, (msg) => msg.value?.notification_id === notificationId && msg.value?.channel_name === 'PUSH');
            expect(pushMessage).toBeTruthy();
            expect(pushMessage?.topic).toBe(kafka_config_1.KAFKA_TOPICS.PUSH_NOTIFICATION);
            expect(pushMessage?.key).toBe(notificationId);
            const pushValue = pushMessage.value;
            expect(pushValue).toMatchObject({
                notification_id: notificationId,
                event_name: 'CHAT_MESSAGE',
                channel_name: 'PUSH',
                recipient: 'user123',
                template_content: 'New message from John Doe: Hello, how are you?',
            });
            const emailMessage = await kafkaHelper.waitForMessage(kafka_config_1.KAFKA_TOPICS.EMAIL_NOTIFICATION, 15000, (msg) => msg.value?.notification_id === notificationId && msg.value?.channel_name === 'EMAIL');
            expect(emailMessage).toBeTruthy();
            expect(emailMessage?.topic).toBe(kafka_config_1.KAFKA_TOPICS.EMAIL_NOTIFICATION);
            expect(emailMessage?.key).toBe(notificationId);
            const emailValue = emailMessage.value;
            expect(emailValue).toMatchObject({
                notification_id: notificationId,
                event_name: 'CHAT_MESSAGE',
                channel_name: 'EMAIL',
                recipient: 'jane@example.com',
                template_content: '<h1>New Message</h1><p>Hi Jane Doe,</p><p>You have a new message from John Doe:</p><p>Hello, how are you?</p>',
                template_subject: 'New Message from John Doe',
            });
            const pushDeliveryLog = await kafkaHelper.waitForMessage(kafka_config_1.KAFKA_TOPICS.DELIVERY_LOGS, 15000, (msg) => msg.value?.notification_id === notificationId &&
                msg.value?.channel_name === 'PUSH' &&
                msg.value?.stage === 'routed');
            expect(pushDeliveryLog).toBeTruthy();
            const pushLogValue = pushDeliveryLog.value;
            expect(pushLogValue).toMatchObject({
                notification_id: notificationId,
                event_name: 'CHAT_MESSAGE',
                channel_name: 'PUSH',
                stage: 'routed',
                status: 'pending',
            });
            expect(pushLogValue.event_id).toBeGreaterThan(0);
            expect(pushLogValue.channel_id).toBeGreaterThan(0);
            expect(pushLogValue.timestamp).toBeDefined();
            const emailDeliveryLog = await kafkaHelper.waitForMessage(kafka_config_1.KAFKA_TOPICS.DELIVERY_LOGS, 15000, (msg) => msg.value?.notification_id === notificationId &&
                msg.value?.channel_name === 'EMAIL' &&
                msg.value?.stage === 'routed');
            expect(emailDeliveryLog).toBeTruthy();
            const emailLogValue = emailDeliveryLog.value;
            expect(emailLogValue).toMatchObject({
                notification_id: notificationId,
                event_name: 'CHAT_MESSAGE',
                channel_name: 'EMAIL',
                stage: 'routed',
                status: 'pending',
            });
            expect(emailLogValue.event_id).toBeGreaterThan(0);
            expect(emailLogValue.channel_id).toBeGreaterThan(0);
            expect(emailLogValue.timestamp).toBeDefined();
            const pushSuccessLog = await kafkaHelper.waitForMessage(kafka_config_1.KAFKA_TOPICS.DELIVERY_LOGS, 20000, (msg) => msg.value?.notification_id === notificationId &&
                msg.value?.channel_name === 'PUSH' &&
                msg.value?.stage === 'provider_success' &&
                msg.value?.status === 'success');
            expect(pushSuccessLog).toBeTruthy();
            const pushSuccessValue = pushSuccessLog.value;
            expect(pushSuccessValue).toMatchObject({
                notification_id: notificationId,
                event_name: 'CHAT_MESSAGE',
                channel_name: 'PUSH',
                stage: 'provider_success',
                status: 'success',
            });
            expect(pushSuccessValue.provider_name).toBeDefined();
            expect(pushSuccessValue.message_id).toBeDefined();
            expect(pushSuccessValue.timestamp).toBeDefined();
            const emailSuccessLog = await kafkaHelper.waitForMessage(kafka_config_1.KAFKA_TOPICS.DELIVERY_LOGS, 20000, (msg) => msg.value?.notification_id === notificationId &&
                msg.value?.channel_name === 'EMAIL' &&
                msg.value?.stage === 'provider_success' &&
                msg.value?.status === 'success');
            expect(emailSuccessLog).toBeTruthy();
            const emailSuccessValue = emailSuccessLog.value;
            expect(emailSuccessValue).toMatchObject({
                notification_id: notificationId,
                event_name: 'CHAT_MESSAGE',
                channel_name: 'EMAIL',
                stage: 'provider_success',
                status: 'success',
            });
            expect(emailSuccessValue.provider_name).toBeDefined();
            expect(emailSuccessValue.message_id).toBeDefined();
            expect(emailSuccessValue.timestamp).toBeDefined();
        });
        it('should publish PURCHASE to notification topic with both PUSH and EMAIL channels', async () => {
            const notificationId = `test-purchase-${Date.now()}`;
            const payload = {
                notification_id: notificationId,
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
            };
            const response = await (0, supertest_1.default)(app.getHttpServer())
                .post('/notifications/send')
                .send(payload)
                .expect(202);
            expect(response.body.success).toBe(true);
            const notificationMessage = await kafkaHelper.waitForMessage(kafka_config_1.KAFKA_TOPICS.NOTIFICATION, 10000, (msg) => msg.value?.notification_id === notificationId);
            expect(notificationMessage).toBeTruthy();
            const messageValue = notificationMessage?.value;
            expect(messageValue.event_name).toBe('PURCHASE');
            expect(messageValue.rendered_templates).toHaveLength(2);
            expect(messageValue.rendered_templates.some((t) => t.channel_name === 'PUSH')).toBe(true);
            expect(messageValue.rendered_templates.some((t) => t.channel_name === 'EMAIL')).toBe(true);
            const pushMessage = await kafkaHelper.waitForMessage(kafka_config_1.KAFKA_TOPICS.PUSH_NOTIFICATION, 15000, (msg) => msg.value?.notification_id === notificationId && msg.value?.channel_name === 'PUSH');
            expect(pushMessage).toBeTruthy();
            expect(pushMessage?.topic).toBe(kafka_config_1.KAFKA_TOPICS.PUSH_NOTIFICATION);
            const pushValue = pushMessage.value;
            expect(pushValue).toMatchObject({
                notification_id: notificationId,
                event_name: 'PURCHASE',
                channel_name: 'PUSH',
                recipient: 'user123',
                template_content: 'Your purchase #ORD123 has been confirmed!',
            });
            const emailMessage = await kafkaHelper.waitForMessage(kafka_config_1.KAFKA_TOPICS.EMAIL_NOTIFICATION, 15000, (msg) => msg.value?.notification_id === notificationId && msg.value?.channel_name === 'EMAIL');
            expect(emailMessage).toBeTruthy();
            expect(emailMessage?.topic).toBe(kafka_config_1.KAFKA_TOPICS.EMAIL_NOTIFICATION);
            const emailValue = emailMessage.value;
            expect(emailValue).toMatchObject({
                notification_id: notificationId,
                event_name: 'PURCHASE',
                channel_name: 'EMAIL',
                recipient: 'jane@example.com',
                template_content: '<h1>Purchase Confirmed</h1><p>Hi Jane Doe,</p><p>Your purchase #ORD123 has been confirmed!</p><p>Total: 99.99</p>',
                template_subject: 'Purchase Confirmation - Order #ORD123',
            });
            const pushDeliveryLog = await kafkaHelper.waitForMessage(kafka_config_1.KAFKA_TOPICS.DELIVERY_LOGS, 15000, (msg) => msg.value?.notification_id === notificationId &&
                msg.value?.channel_name === 'PUSH' &&
                msg.value?.stage === 'routed');
            expect(pushDeliveryLog).toBeTruthy();
            const pushLogValue = pushDeliveryLog.value;
            expect(pushLogValue).toMatchObject({
                notification_id: notificationId,
                event_name: 'PURCHASE',
                channel_name: 'PUSH',
                stage: 'routed',
                status: 'pending',
            });
            const emailDeliveryLog = await kafkaHelper.waitForMessage(kafka_config_1.KAFKA_TOPICS.DELIVERY_LOGS, 15000, (msg) => msg.value?.notification_id === notificationId &&
                msg.value?.channel_name === 'EMAIL' &&
                msg.value?.stage === 'routed');
            expect(emailDeliveryLog).toBeTruthy();
            const emailLogValue = emailDeliveryLog.value;
            expect(emailLogValue).toMatchObject({
                notification_id: notificationId,
                event_name: 'PURCHASE',
                channel_name: 'EMAIL',
                stage: 'routed',
                status: 'pending',
            });
            const pushSuccessLog = await kafkaHelper.waitForMessage(kafka_config_1.KAFKA_TOPICS.DELIVERY_LOGS, 20000, (msg) => msg.value?.notification_id === notificationId &&
                msg.value?.channel_name === 'PUSH' &&
                msg.value?.stage === 'provider_success' &&
                msg.value?.status === 'success');
            expect(pushSuccessLog).toBeTruthy();
            const pushSuccessValue = pushSuccessLog.value;
            expect(pushSuccessValue).toMatchObject({
                notification_id: notificationId,
                event_name: 'PURCHASE',
                channel_name: 'PUSH',
                stage: 'provider_success',
                status: 'success',
            });
            expect(pushSuccessValue.provider_name).toBeDefined();
            expect(pushSuccessValue.message_id).toBeDefined();
            const emailSuccessLog = await kafkaHelper.waitForMessage(kafka_config_1.KAFKA_TOPICS.DELIVERY_LOGS, 20000, (msg) => msg.value?.notification_id === notificationId &&
                msg.value?.channel_name === 'EMAIL' &&
                msg.value?.stage === 'provider_success' &&
                msg.value?.status === 'success');
            expect(emailSuccessLog).toBeTruthy();
            const emailSuccessValue = emailSuccessLog.value;
            expect(emailSuccessValue).toMatchObject({
                notification_id: notificationId,
                event_name: 'PURCHASE',
                channel_name: 'EMAIL',
                stage: 'provider_success',
                status: 'success',
            });
            expect(emailSuccessValue.provider_name).toBeDefined();
            expect(emailSuccessValue.message_id).toBeDefined();
        });
        it('should publish PAYMENT_REMINDER to notification topic with only PUSH channel', async () => {
            const notificationId = `test-payment-${Date.now()}`;
            const payload = {
                notification_id: notificationId,
                event_type: 'PAYMENT_REMINDER',
                data: {
                    order_id: 'ORD123',
                    user_id: 'user123',
                },
                metadata: {
                    source: 'payment_service',
                    user_id: 'user123',
                },
            };
            const response = await (0, supertest_1.default)(app.getHttpServer())
                .post('/notifications/send')
                .send(payload)
                .expect(202);
            expect(response.body.success).toBe(true);
            const notificationMessage = await kafkaHelper.waitForMessage(kafka_config_1.KAFKA_TOPICS.NOTIFICATION, 10000, (msg) => msg.value?.notification_id === notificationId);
            expect(notificationMessage).toBeTruthy();
            const messageValue = notificationMessage?.value;
            expect(messageValue.event_name).toBe('PAYMENT_REMINDER');
            expect(messageValue.rendered_templates).toHaveLength(1);
            expect(messageValue.rendered_templates[0].channel_name).toBe('PUSH');
            expect(messageValue.rendered_templates.some((t) => t.channel_name === 'EMAIL')).toBe(false);
            const pushMessage = await kafkaHelper.waitForMessage(kafka_config_1.KAFKA_TOPICS.PUSH_NOTIFICATION, 15000, (msg) => msg.value?.notification_id === notificationId && msg.value?.channel_name === 'PUSH');
            expect(pushMessage).toBeTruthy();
            expect(pushMessage?.topic).toBe(kafka_config_1.KAFKA_TOPICS.PUSH_NOTIFICATION);
            const pushValue = pushMessage.value;
            expect(pushValue).toMatchObject({
                notification_id: notificationId,
                event_name: 'PAYMENT_REMINDER',
                channel_name: 'PUSH',
                recipient: 'user123',
                template_content: 'Reminder: Payment due for order #ORD123',
            });
            const pushDeliveryLog = await kafkaHelper.waitForMessage(kafka_config_1.KAFKA_TOPICS.DELIVERY_LOGS, 15000, (msg) => msg.value?.notification_id === notificationId &&
                msg.value?.channel_name === 'PUSH' &&
                msg.value?.stage === 'routed');
            expect(pushDeliveryLog).toBeTruthy();
            const pushLogValue = pushDeliveryLog.value;
            expect(pushLogValue).toMatchObject({
                notification_id: notificationId,
                event_name: 'PAYMENT_REMINDER',
                channel_name: 'PUSH',
                stage: 'routed',
                status: 'pending',
            });
            const pushSuccessLog = await kafkaHelper.waitForMessage(kafka_config_1.KAFKA_TOPICS.DELIVERY_LOGS, 20000, (msg) => msg.value?.notification_id === notificationId &&
                msg.value?.channel_name === 'PUSH' &&
                msg.value?.stage === 'provider_success' &&
                msg.value?.status === 'success');
            expect(pushSuccessLog).toBeTruthy();
            const pushSuccessValue = pushSuccessLog.value;
            expect(pushSuccessValue).toMatchObject({
                notification_id: notificationId,
                event_name: 'PAYMENT_REMINDER',
                channel_name: 'PUSH',
                stage: 'provider_success',
                status: 'success',
            });
            expect(pushSuccessValue.provider_name).toBeDefined();
            expect(pushSuccessValue.message_id).toBeDefined();
            await new Promise((resolve) => setTimeout(resolve, 1000));
            const emailMessages = kafkaHelper.getMessages(kafka_config_1.KAFKA_TOPICS.EMAIL_NOTIFICATION);
            const emailMessageForThisNotification = emailMessages.find((msg) => msg.value?.notification_id === notificationId);
            expect(emailMessageForThisNotification).toBeUndefined();
        });
        it('should publish SHIPPING_UPDATE to notification topic with only PUSH channel', async () => {
            const notificationId = `test-shipping-${Date.now()}`;
            const payload = {
                notification_id: notificationId,
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
            };
            const response = await (0, supertest_1.default)(app.getHttpServer())
                .post('/notifications/send')
                .send(payload)
                .expect(202);
            expect(response.body.success).toBe(true);
            const notificationMessage = await kafkaHelper.waitForMessage(kafka_config_1.KAFKA_TOPICS.NOTIFICATION, 10000, (msg) => msg.value?.notification_id === notificationId);
            expect(notificationMessage).toBeTruthy();
            const messageValue = notificationMessage?.value;
            expect(messageValue.event_name).toBe('SHIPPING_UPDATE');
            expect(messageValue.rendered_templates).toHaveLength(1);
            expect(messageValue.rendered_templates[0].channel_name).toBe('PUSH');
            expect(messageValue.rendered_templates.some((t) => t.channel_name === 'EMAIL')).toBe(false);
            const pushMessage = await kafkaHelper.waitForMessage(kafka_config_1.KAFKA_TOPICS.PUSH_NOTIFICATION, 15000, (msg) => msg.value?.notification_id === notificationId && msg.value?.channel_name === 'PUSH');
            expect(pushMessage).toBeTruthy();
            expect(pushMessage?.topic).toBe(kafka_config_1.KAFKA_TOPICS.PUSH_NOTIFICATION);
            const pushValue = pushMessage.value;
            expect(pushValue).toMatchObject({
                notification_id: notificationId,
                event_name: 'SHIPPING_UPDATE',
                channel_name: 'PUSH',
                recipient: 'user123',
                template_content: 'Shipping update: Your order #ORD123 has been shipped',
            });
            const pushDeliveryLog = await kafkaHelper.waitForMessage(kafka_config_1.KAFKA_TOPICS.DELIVERY_LOGS, 15000, (msg) => msg.value?.notification_id === notificationId &&
                msg.value?.channel_name === 'PUSH' &&
                msg.value?.stage === 'routed');
            expect(pushDeliveryLog).toBeTruthy();
            const pushLogValue = pushDeliveryLog.value;
            expect(pushLogValue).toMatchObject({
                notification_id: notificationId,
                event_name: 'SHIPPING_UPDATE',
                channel_name: 'PUSH',
                stage: 'routed',
                status: 'pending',
            });
            const pushSuccessLog = await kafkaHelper.waitForMessage(kafka_config_1.KAFKA_TOPICS.DELIVERY_LOGS, 20000, (msg) => msg.value?.notification_id === notificationId &&
                msg.value?.channel_name === 'PUSH' &&
                msg.value?.stage === 'provider_success' &&
                msg.value?.status === 'success');
            expect(pushSuccessLog).toBeTruthy();
            const pushSuccessValue = pushSuccessLog.value;
            expect(pushSuccessValue).toMatchObject({
                notification_id: notificationId,
                event_name: 'SHIPPING_UPDATE',
                channel_name: 'PUSH',
                stage: 'provider_success',
                status: 'success',
            });
            expect(pushSuccessValue.provider_name).toBeDefined();
            expect(pushSuccessValue.message_id).toBeDefined();
            await new Promise((resolve) => setTimeout(resolve, 1000));
            const emailMessages = kafkaHelper.getMessages(kafka_config_1.KAFKA_TOPICS.EMAIL_NOTIFICATION);
            const emailMessageForThisNotification = emailMessages.find((msg) => msg.value?.notification_id === notificationId);
            expect(emailMessageForThisNotification).toBeUndefined();
        });
        it('should return 404 for invalid event type', async () => {
            const payload = {
                notification_id: `test-invalid-${Date.now()}`,
                event_type: 'INVALID_EVENT',
                data: {
                    test: 'data',
                },
            };
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/notifications/send')
                .send(payload)
                .expect(404);
        });
        it('should return 400 for missing required fields', async () => {
            const payload = {
                notification_id: `test-missing-${Date.now()}`,
                event_type: 'CHAT_MESSAGE',
                data: {},
            };
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/notifications/send')
                .send(payload)
                .expect(400);
        });
        it('should validate request body structure', async () => {
            const payload = {
                event_type: 'CHAT_MESSAGE',
                data: {},
            };
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/notifications/send')
                .send(payload)
                .expect(400);
        });
    });
    describe('Kafka Topic Messages', () => {
        it('should verify messages are published to notification topic', async () => {
            const notificationId = `test-topic-${Date.now()}`;
            const payload = {
                notification_id: notificationId,
                event_type: 'CHAT_MESSAGE',
                data: {
                    sender_name: 'John Doe',
                    message_preview: 'Test message',
                    user_id: 'user123',
                    user_name: 'Jane Doe',
                    user_email: 'jane@example.com',
                },
            };
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/notifications/send')
                .send(payload)
                .expect(202);
            const messages = await kafkaHelper.waitForMessage(kafka_config_1.KAFKA_TOPICS.NOTIFICATION, 10000, (msg) => msg.value?.notification_id === notificationId);
            expect(messages).toBeTruthy();
            expect(messages?.topic).toBe(kafka_config_1.KAFKA_TOPICS.NOTIFICATION);
            expect(messages?.value).toHaveProperty('notification_id', notificationId);
            expect(messages?.value).toHaveProperty('event_name');
            expect(messages?.value).toHaveProperty('rendered_templates');
            expect(messages?.value).toHaveProperty('data');
            expect(messages?.value).toHaveProperty('metadata');
        });
        it('should verify messages are routed to PUSH_NOTIFICATION and EMAIL_NOTIFICATION topics', async () => {
            const notificationId = `test-routing-${Date.now()}`;
            const payload = {
                notification_id: notificationId,
                event_type: 'CHAT_MESSAGE',
                data: {
                    sender_name: 'John Doe',
                    message_preview: 'Test routing',
                    user_id: 'user123',
                    user_name: 'Jane Doe',
                    user_email: 'jane@example.com',
                },
            };
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/notifications/send')
                .send(payload)
                .expect(202);
            const notificationMessage = await kafkaHelper.waitForMessage(kafka_config_1.KAFKA_TOPICS.NOTIFICATION, 10000, (msg) => msg.value?.notification_id === notificationId);
            expect(notificationMessage).toBeTruthy();
            const pushMessage = await kafkaHelper.waitForMessage(kafka_config_1.KAFKA_TOPICS.PUSH_NOTIFICATION, 15000, (msg) => msg.value?.notification_id === notificationId && msg.value?.channel_name === 'PUSH');
            expect(pushMessage).toBeTruthy();
            expect(pushMessage?.topic).toBe(kafka_config_1.KAFKA_TOPICS.PUSH_NOTIFICATION);
            expect(pushMessage?.key).toBe(notificationId);
            const pushValue = pushMessage.value;
            expect(pushValue).toMatchObject({
                notification_id: notificationId,
                channel_name: 'PUSH',
                recipient: 'user123',
                template_content: 'New message from John Doe: Test routing',
            });
            const emailMessage = await kafkaHelper.waitForMessage(kafka_config_1.KAFKA_TOPICS.EMAIL_NOTIFICATION, 15000, (msg) => msg.value?.notification_id === notificationId && msg.value?.channel_name === 'EMAIL');
            expect(emailMessage).toBeTruthy();
            expect(emailMessage?.topic).toBe(kafka_config_1.KAFKA_TOPICS.EMAIL_NOTIFICATION);
            expect(emailMessage?.key).toBe(notificationId);
            const emailValue = emailMessage.value;
            expect(emailValue).toMatchObject({
                notification_id: notificationId,
                channel_name: 'EMAIL',
                recipient: 'jane@example.com',
                template_content: '<h1>New Message</h1><p>Hi Jane Doe,</p><p>You have a new message from John Doe:</p><p>Test routing</p>',
                template_subject: 'New Message from John Doe',
            });
            const allDeliveryLogs = kafkaHelper.getMessages(kafka_config_1.KAFKA_TOPICS.DELIVERY_LOGS);
            const routingLogs = allDeliveryLogs.filter((msg) => msg.value?.notification_id === notificationId && msg.value?.stage === 'routed');
            expect(routingLogs.length).toBeGreaterThanOrEqual(2);
            const pushLog = routingLogs.find((msg) => msg.value?.channel_name === 'PUSH');
            expect(pushLog).toBeTruthy();
            expect(pushLog.value).toMatchObject({
                notification_id: notificationId,
                channel_name: 'PUSH',
                stage: 'routed',
                status: 'pending',
            });
            const emailLog = routingLogs.find((msg) => msg.value?.channel_name === 'EMAIL');
            expect(emailLog).toBeTruthy();
            expect(emailLog.value).toMatchObject({
                notification_id: notificationId,
                channel_name: 'EMAIL',
                stage: 'routed',
                status: 'pending',
            });
            await new Promise((resolve) => setTimeout(resolve, 2000));
            const allLogs = kafkaHelper.getMessages(kafka_config_1.KAFKA_TOPICS.DELIVERY_LOGS);
            const successLogs = allLogs.filter((msg) => msg.value?.notification_id === notificationId &&
                msg.value?.stage === 'provider_success' &&
                msg.value?.status === 'success');
            const pushSuccessLog = successLogs.find((msg) => msg.value?.channel_name === 'PUSH');
            expect(pushSuccessLog).toBeTruthy();
            expect(pushSuccessLog.value).toMatchObject({
                notification_id: notificationId,
                channel_name: 'PUSH',
                stage: 'provider_success',
                status: 'success',
            });
            expect(pushSuccessLog.value.provider_name).toBeDefined();
            expect(pushSuccessLog.value.message_id).toBeDefined();
            const emailSuccessLog = successLogs.find((msg) => msg.value?.channel_name === 'EMAIL');
            expect(emailSuccessLog).toBeTruthy();
            expect(emailSuccessLog.value).toMatchObject({
                notification_id: notificationId,
                channel_name: 'EMAIL',
                stage: 'provider_success',
                status: 'success',
            });
            expect(emailSuccessLog.value.provider_name).toBeDefined();
            expect(emailSuccessLog.value.message_id).toBeDefined();
        });
        it('should verify message key is set to notification_id', async () => {
            const notificationId = `test-key-${Date.now()}`;
            const payload = {
                notification_id: notificationId,
                event_type: 'PURCHASE',
                data: {
                    order_id: 'ORD123',
                    user_id: 'user123',
                    user_name: 'Jane Doe',
                    total_amount: 99.99,
                    user_email: 'jane@example.com',
                },
            };
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/notifications/send')
                .send(payload)
                .expect(202);
            const message = await kafkaHelper.waitForMessage(kafka_config_1.KAFKA_TOPICS.NOTIFICATION, 10000, (msg) => msg.value?.notification_id === notificationId);
            expect(message?.key).toBe(notificationId);
        });
        it('should verify rendered templates contain correct channel information', async () => {
            const notificationId = `test-templates-${Date.now()}`;
            const payload = {
                notification_id: notificationId,
                event_type: 'CHAT_MESSAGE',
                data: {
                    sender_name: 'John Doe',
                    message_preview: 'Hello',
                    user_id: 'user123',
                    user_name: 'Jane Doe',
                    user_email: 'jane@example.com',
                },
            };
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/notifications/send')
                .send(payload)
                .expect(202);
            const message = await kafkaHelper.waitForMessage(kafka_config_1.KAFKA_TOPICS.NOTIFICATION, 10000, (msg) => msg.value?.notification_id === notificationId);
            const messageValue = message?.value;
            expect(messageValue.rendered_templates).toBeDefined();
            expect(Array.isArray(messageValue.rendered_templates)).toBe(true);
            messageValue.rendered_templates.forEach((template) => {
                expect(template).toHaveProperty('channel_id');
                expect(template).toHaveProperty('channel_name');
                expect(template).toHaveProperty('template_id');
                expect(template).toHaveProperty('template_name');
                expect(template).toHaveProperty('content');
                expect(template).toHaveProperty('recipient');
            });
        });
    });
});
//# sourceMappingURL=notification-api.integration.spec.js.map