import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { NotificationApiModule } from '../../src/notification-api/notification-api.module';
import { KafkaTestHelper } from '../../src/test/kafka-test-helper';
import { KAFKA_TOPICS } from '../../src/kafka/kafka.config';
import { NotificationMessage } from '../../src/kafka/types/notification-message';
import { ChannelMessage } from '../../src/kafka/types/channel-message';
import { DeliveryLog } from '../../src/kafka/types/delivery-log';
import { ProviderRequestResponse } from '../../src/kafka/types/provider-response';

/**
 * Integration tests for Notification API
 * 
 * These tests verify:
 * - API endpoint functionality
 * - Messages are published to Kafka 'notification' topic
 * - Messages are routed to 'notification.push' and 'notification.email' topics
 * - Message structure and content validation
 * - Template rendering for different event types
 * - Channel routing information (PUSH/EMAIL) in templates
 * 
 * Note: Routing to 'notification.push' and 'notification.email' topics
 * happens in the notification worker. The tests require messages to be present
 * in those topics, so the notification worker must be running for these tests
 * to pass.
 */
describe('NotificationApi Integration Tests (e2e)', () => {
  let app: INestApplication;
  let kafkaHelper: KafkaTestHelper;

  beforeAll(async () => {
    // Create Kafka test helper
    kafkaHelper = new KafkaTestHelper();

    // Create consumer for notification topic (main topic where API publishes)
    await kafkaHelper.createConsumerForTopic(
      KAFKA_TOPICS.NOTIFICATION,
      'test-notification-consumer'
    );
    
    // Note: Consumers for PUSH_NOTIFICATION, EMAIL_NOTIFICATION, and DELIVERY_LOGS
    // are created but won't receive messages unless the notification worker is running.
    // These are set up for potential future full end-to-end tests.
    await kafkaHelper.createConsumerForTopic(
      KAFKA_TOPICS.PUSH_NOTIFICATION,
      'test-push-consumer'
    );
    await kafkaHelper.createConsumerForTopic(
      KAFKA_TOPICS.EMAIL_NOTIFICATION,
      'test-email-consumer'
    );
    await kafkaHelper.createConsumerForTopic(
      KAFKA_TOPICS.DELIVERY_LOGS,
      'test-delivery-logs-consumer'
    );
    await kafkaHelper.createConsumerForTopic(
      KAFKA_TOPICS.PROVIDER_REQUEST_RESPONSE,
      'test-provider-response-consumer'
    );

    // Wait a bit for consumers to be ready
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Create NestJS application
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [NotificationApiModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      })
    );

    await app.init();
  });

  afterAll(async () => {
    await kafkaHelper.disconnectAll();
    await app.close();
  });

  beforeEach(() => {
    // Clear all messages before each test
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

      const response = await request(app.getHttpServer())
        .post('/notifications/send')
        .send(payload)
        .expect(202);

      expect(response.body).toEqual({
        success: true,
        notification_id: notificationId,
        message: 'Notification accepted and queued for processing',
      });

      // Wait for message on notification topic
      const notificationMessage = await kafkaHelper.waitForMessage(
        KAFKA_TOPICS.NOTIFICATION,
        10000,
        (msg) => msg.value?.notification_id === notificationId
      );

      expect(notificationMessage).toBeTruthy();
      expect(notificationMessage?.topic).toBe(KAFKA_TOPICS.NOTIFICATION);
      expect(notificationMessage?.key).toBe(notificationId);
      expect(notificationMessage?.value).toMatchObject({
        notification_id: notificationId,
        event_name: 'CHAT_MESSAGE',
        event_id: expect.any(Number),
        rendered_templates: expect.any(Array),
      });

      const messageValue: NotificationMessage = notificationMessage?.value;
      expect(messageValue.rendered_templates).toHaveLength(2);
      expect(messageValue.rendered_templates.some((t) => t.channel_name === 'PUSH')).toBe(true);
      expect(messageValue.rendered_templates.some((t) => t.channel_name === 'EMAIL')).toBe(true);

      // Verify messages are routed to PUSH_NOTIFICATION topic
      const pushMessage = await kafkaHelper.waitForMessage(
        KAFKA_TOPICS.PUSH_NOTIFICATION,
        15000,
        (msg) => msg.value?.notification_id === notificationId && msg.value?.channel_name === 'PUSH'
      );
      expect(pushMessage).toBeTruthy();
      expect(pushMessage?.topic).toBe(KAFKA_TOPICS.PUSH_NOTIFICATION);
      expect(pushMessage?.key).toBe(notificationId);
      const pushValue: ChannelMessage = pushMessage!.value;
      expect(pushValue).toMatchObject({
        notification_id: notificationId,
        event_name: 'CHAT_MESSAGE',
        channel_name: 'PUSH',
        recipient: 'user123',
        template_content: 'New message from John Doe: Hello, how are you?',
      });

      // Verify messages are routed to EMAIL_NOTIFICATION topic
      const emailMessage = await kafkaHelper.waitForMessage(
        KAFKA_TOPICS.EMAIL_NOTIFICATION,
        15000,
        (msg) => msg.value?.notification_id === notificationId && msg.value?.channel_name === 'EMAIL'
      );
      expect(emailMessage).toBeTruthy();
      expect(emailMessage?.topic).toBe(KAFKA_TOPICS.EMAIL_NOTIFICATION);
      expect(emailMessage?.key).toBe(notificationId);
      const emailValue: ChannelMessage = emailMessage!.value;
      expect(emailValue).toMatchObject({
        notification_id: notificationId,
        event_name: 'CHAT_MESSAGE',
        channel_name: 'EMAIL',
        recipient: 'jane@example.com',
        template_content: '<h1>New Message</h1><p>Hi Jane Doe,</p><p>You have a new message from John Doe:</p><p>Hello, how are you?</p>',
        template_subject: 'New Message from John Doe',
      });

      // Verify delivery logs for PUSH channel
      const pushDeliveryLog = await kafkaHelper.waitForMessage(
        KAFKA_TOPICS.DELIVERY_LOGS,
        15000,
        (msg) => msg.value?.notification_id === notificationId && 
                 msg.value?.channel_name === 'PUSH' && 
                 msg.value?.stage === 'routed'
      );
      expect(pushDeliveryLog).toBeTruthy();
      const pushLogValue: DeliveryLog = pushDeliveryLog!.value;
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

      // Verify delivery logs for EMAIL channel
      const emailDeliveryLog = await kafkaHelper.waitForMessage(
        KAFKA_TOPICS.DELIVERY_LOGS,
        15000,
        (msg) => msg.value?.notification_id === notificationId && 
                 msg.value?.channel_name === 'EMAIL' && 
                 msg.value?.stage === 'routed'
      );
      expect(emailDeliveryLog).toBeTruthy();
      const emailLogValue: DeliveryLog = emailDeliveryLog!.value;
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

      // Verify successful delivery log for PUSH channel (provider_success)
      // Note: This requires push worker to be running
      const pushSuccessLog = await kafkaHelper.waitForMessage(
        KAFKA_TOPICS.DELIVERY_LOGS,
        20000,
        (msg) => msg.value?.notification_id === notificationId && 
                 msg.value?.channel_name === 'PUSH' && 
                 msg.value?.stage === 'provider_success' &&
                 msg.value?.status === 'success'
      );
      expect(pushSuccessLog).toBeTruthy();
      const pushSuccessValue: DeliveryLog = pushSuccessLog!.value;
      expect(pushSuccessValue).toMatchObject({
        notification_id: notificationId,
        event_name: 'CHAT_MESSAGE',
        channel_name: 'PUSH',
        stage: 'provider_success',
        status: 'success',
      });
      expect(pushSuccessValue.provider_request_id).toBe(notificationId);
      expect(pushSuccessValue.message_id).toBeDefined();
      expect(pushSuccessValue.timestamp).toBeDefined();

      // Verify successful delivery log for EMAIL channel (provider_success)
      // Note: This requires email worker to be running
      const emailSuccessLog = await kafkaHelper.waitForMessage(
        KAFKA_TOPICS.DELIVERY_LOGS,
        20000,
        (msg) => msg.value?.notification_id === notificationId && 
                 msg.value?.channel_name === 'EMAIL' && 
                 msg.value?.stage === 'provider_success' &&
                 msg.value?.status === 'success'
      );
      expect(emailSuccessLog).toBeTruthy();
      const emailSuccessValue: DeliveryLog = emailSuccessLog!.value;
      expect(emailSuccessValue).toMatchObject({
        notification_id: notificationId,
        event_name: 'CHAT_MESSAGE',
        channel_name: 'EMAIL',
        stage: 'provider_success',
        status: 'success',
      });
      expect(emailSuccessValue.provider_request_id).toBe(notificationId);
      expect(emailSuccessValue.message_id).toBeDefined();
      expect(emailSuccessValue.timestamp).toBeDefined();

      // Verify provider request/response messages for PUSH channel
      const pushProviderResponse = await kafkaHelper.waitForMessage(
        KAFKA_TOPICS.PROVIDER_REQUEST_RESPONSE,
        20000,
        (msg) => msg.value?.notification_id === notificationId && 
                 msg.value?.channel_name === 'PUSH'
      );
      expect(pushProviderResponse).toBeTruthy();
      const pushProviderValue: ProviderRequestResponse = pushProviderResponse!.value;
      expect(pushProviderValue).toMatchObject({
        provider_request_id: notificationId,
        notification_id: notificationId,
        event_name: 'CHAT_MESSAGE',
        channel_name: 'PUSH',
        provider_name: 'PushProvider1',
      });
      
      // Verify request structure (parsed from JSON string)
      const pushRequest = JSON.parse(pushProviderValue.request);
      expect(pushRequest).toMatchObject({
        deviceToken: 'user123',
        title: null,
        body: 'New message from John Doe: Hello, how are you?',
        idempotentKey: notificationId,
        metadata: {
          source: 'chat_service',
          user_id: 'user123',
        },
      });
      
      // Verify headers structure
      expect(pushProviderValue.request_header).toMatchObject({
        'Content-Type': 'application/json',
        'X-Idempotent-Key': notificationId,
        'X-Provider': 'PushProvider1',
        'X-Provider-Version': '1.0',
      });
      
      // Verify response structure (parsed from JSON string)
      const pushResponse = JSON.parse(pushProviderValue.response);
      expect(pushResponse).toMatchObject({
        success: true,
      });
      expect(pushResponse.messageId).toBeDefined();
      expect(typeof pushResponse.messageId).toBe('string');
      
      expect(pushProviderValue.request_timestamp).toBeDefined();
      expect(pushProviderValue.response_timestamp).toBeDefined();
      expect(new Date(pushProviderValue.response_timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(pushProviderValue.request_timestamp).getTime()
      );

      // Verify provider request/response messages for EMAIL channel
      const emailProviderResponse = await kafkaHelper.waitForMessage(
        KAFKA_TOPICS.PROVIDER_REQUEST_RESPONSE,
        20000,
        (msg) => msg.value?.notification_id === notificationId && 
                 msg.value?.channel_name === 'EMAIL'
      );
      expect(emailProviderResponse).toBeTruthy();
      const emailProviderValue: ProviderRequestResponse = emailProviderResponse!.value;
      expect(emailProviderValue).toMatchObject({
        provider_request_id: notificationId,
        notification_id: notificationId,
        event_name: 'CHAT_MESSAGE',
        channel_name: 'EMAIL',
        provider_name: 'EmailProvider1',
      });
      
      // Verify request structure (parsed from JSON string)
      const emailRequest = JSON.parse(emailProviderValue.request);
      expect(emailRequest).toMatchObject({
        recipient: 'jane@example.com',
        subject: 'New Message from John Doe',
        content: '<h1>New Message</h1><p>Hi Jane Doe,</p><p>You have a new message from John Doe:</p><p>Hello, how are you?</p>',
        idempotentKey: notificationId,
        from: 'noreply@example.com',
        to: 'jane@example.com',
        metadata: {
          source: 'chat_service',
          user_id: 'user123',
        },
      });
      
      // Verify headers structure
      expect(emailProviderValue.request_header).toMatchObject({
        'Content-Type': 'application/json',
        'X-Idempotent-Key': notificationId,
        'X-Provider': 'EmailProvider1',
        'X-Provider-Version': '1.0',
      });
      
      // Verify response structure (parsed from JSON string)
      const emailResponse = JSON.parse(emailProviderValue.response);
      expect(emailResponse).toMatchObject({
        success: true,
      });
      expect(emailResponse.messageId).toBeDefined();
      expect(typeof emailResponse.messageId).toBe('string');
      
      expect(emailProviderValue.request_timestamp).toBeDefined();
      expect(emailProviderValue.response_timestamp).toBeDefined();
      expect(new Date(emailProviderValue.response_timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(emailProviderValue.request_timestamp).getTime()
      );
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

      const response = await request(app.getHttpServer())
        .post('/notifications/send')
        .send(payload)
        .expect(202);

      expect(response.body.success).toBe(true);

      // Wait for message on notification topic
      const notificationMessage = await kafkaHelper.waitForMessage(
        KAFKA_TOPICS.NOTIFICATION,
        10000,
        (msg) => msg.value?.notification_id === notificationId
      );

      expect(notificationMessage).toBeTruthy();
      const messageValue: NotificationMessage = notificationMessage?.value;
      expect(messageValue.event_name).toBe('PURCHASE');
      expect(messageValue.rendered_templates).toHaveLength(2);
      expect(messageValue.rendered_templates.some((t) => t.channel_name === 'PUSH')).toBe(true);
      expect(messageValue.rendered_templates.some((t) => t.channel_name === 'EMAIL')).toBe(true);

      // Verify messages are routed to PUSH_NOTIFICATION topic
      const pushMessage = await kafkaHelper.waitForMessage(
        KAFKA_TOPICS.PUSH_NOTIFICATION,
        15000,
        (msg) => msg.value?.notification_id === notificationId && msg.value?.channel_name === 'PUSH'
      );
      expect(pushMessage).toBeTruthy();
      expect(pushMessage?.topic).toBe(KAFKA_TOPICS.PUSH_NOTIFICATION);
      const pushValue: ChannelMessage = pushMessage!.value;
      expect(pushValue).toMatchObject({
        notification_id: notificationId,
        event_name: 'PURCHASE',
        channel_name: 'PUSH',
        recipient: 'user123',
        template_content: 'Your purchase #ORD123 has been confirmed!',
      });

      // Verify messages are routed to EMAIL_NOTIFICATION topic
      const emailMessage = await kafkaHelper.waitForMessage(
        KAFKA_TOPICS.EMAIL_NOTIFICATION,
        15000,
        (msg) => msg.value?.notification_id === notificationId && msg.value?.channel_name === 'EMAIL'
      );
      expect(emailMessage).toBeTruthy();
      expect(emailMessage?.topic).toBe(KAFKA_TOPICS.EMAIL_NOTIFICATION);
      const emailValue: ChannelMessage = emailMessage!.value;
      expect(emailValue).toMatchObject({
        notification_id: notificationId,
        event_name: 'PURCHASE',
        channel_name: 'EMAIL',
        recipient: 'jane@example.com',
        template_content: '<h1>Purchase Confirmed</h1><p>Hi Jane Doe,</p><p>Your purchase #ORD123 has been confirmed!</p><p>Total: 99.99</p>',
        template_subject: 'Purchase Confirmation - Order #ORD123',
      });

      // Verify delivery logs for PUSH channel
      const pushDeliveryLog = await kafkaHelper.waitForMessage(
        KAFKA_TOPICS.DELIVERY_LOGS,
        15000,
        (msg) => msg.value?.notification_id === notificationId && 
                 msg.value?.channel_name === 'PUSH' && 
                 msg.value?.stage === 'routed'
      );
      expect(pushDeliveryLog).toBeTruthy();
      const pushLogValue: DeliveryLog = pushDeliveryLog!.value;
      expect(pushLogValue).toMatchObject({
        notification_id: notificationId,
        event_name: 'PURCHASE',
        channel_name: 'PUSH',
        stage: 'routed',
        status: 'pending',
      });

      // Verify delivery logs for EMAIL channel
      const emailDeliveryLog = await kafkaHelper.waitForMessage(
        KAFKA_TOPICS.DELIVERY_LOGS,
        15000,
        (msg) => msg.value?.notification_id === notificationId && 
                 msg.value?.channel_name === 'EMAIL' && 
                 msg.value?.stage === 'routed'
      );
      expect(emailDeliveryLog).toBeTruthy();
      const emailLogValue: DeliveryLog = emailDeliveryLog!.value;
      expect(emailLogValue).toMatchObject({
        notification_id: notificationId,
        event_name: 'PURCHASE',
        channel_name: 'EMAIL',
        stage: 'routed',
        status: 'pending',
      });

      // Verify successful delivery log for PUSH channel
      const pushSuccessLog = await kafkaHelper.waitForMessage(
        KAFKA_TOPICS.DELIVERY_LOGS,
        20000,
        (msg) => msg.value?.notification_id === notificationId && 
                 msg.value?.channel_name === 'PUSH' && 
                 msg.value?.stage === 'provider_success' &&
                 msg.value?.status === 'success'
      );
      expect(pushSuccessLog).toBeTruthy();
      const pushSuccessValue: DeliveryLog = pushSuccessLog!.value;
      expect(pushSuccessValue).toMatchObject({
        notification_id: notificationId,
        event_name: 'PURCHASE',
        channel_name: 'PUSH',
        stage: 'provider_success',
        status: 'success',
      });
      expect(pushSuccessValue.provider_request_id).toBe(notificationId);
      expect(pushSuccessValue.message_id).toBeDefined();

      // Verify successful delivery log for EMAIL channel
      const emailSuccessLog = await kafkaHelper.waitForMessage(
        KAFKA_TOPICS.DELIVERY_LOGS,
        20000,
        (msg) => msg.value?.notification_id === notificationId && 
                 msg.value?.channel_name === 'EMAIL' && 
                 msg.value?.stage === 'provider_success' &&
                 msg.value?.status === 'success'
      );
      expect(emailSuccessLog).toBeTruthy();
      const emailSuccessValue: DeliveryLog = emailSuccessLog!.value;
      expect(emailSuccessValue).toMatchObject({
        notification_id: notificationId,
        event_name: 'PURCHASE',
        channel_name: 'EMAIL',
        stage: 'provider_success',
        status: 'success',
      });
      expect(emailSuccessValue.provider_request_id).toBe(notificationId);
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

      const response = await request(app.getHttpServer())
        .post('/notifications/send')
        .send(payload)
        .expect(202);

      expect(response.body.success).toBe(true);

      // Wait for message on notification topic
      const notificationMessage = await kafkaHelper.waitForMessage(
        KAFKA_TOPICS.NOTIFICATION,
        10000,
        (msg) => msg.value?.notification_id === notificationId
      );

      expect(notificationMessage).toBeTruthy();
      const messageValue: NotificationMessage = notificationMessage?.value;
      expect(messageValue.event_name).toBe('PAYMENT_REMINDER');
      expect(messageValue.rendered_templates).toHaveLength(1);
      expect(messageValue.rendered_templates[0].channel_name).toBe('PUSH');
      expect(messageValue.rendered_templates.some((t) => t.channel_name === 'EMAIL')).toBe(false);

      // Verify message is routed to PUSH_NOTIFICATION topic (only PUSH, not EMAIL)
      const pushMessage = await kafkaHelper.waitForMessage(
        KAFKA_TOPICS.PUSH_NOTIFICATION,
        15000,
        (msg) => msg.value?.notification_id === notificationId && msg.value?.channel_name === 'PUSH'
      );
      expect(pushMessage).toBeTruthy();
      expect(pushMessage?.topic).toBe(KAFKA_TOPICS.PUSH_NOTIFICATION);
      const pushValue: ChannelMessage = pushMessage!.value;
      expect(pushValue).toMatchObject({
        notification_id: notificationId,
        event_name: 'PAYMENT_REMINDER',
        channel_name: 'PUSH',
        recipient: 'user123',
        template_content: 'Reminder: Payment due for order #ORD123',
      });

      // Verify delivery log for PUSH channel
      const pushDeliveryLog = await kafkaHelper.waitForMessage(
        KAFKA_TOPICS.DELIVERY_LOGS,
        15000,
        (msg) => msg.value?.notification_id === notificationId && 
                 msg.value?.channel_name === 'PUSH' && 
                 msg.value?.stage === 'routed'
      );
      expect(pushDeliveryLog).toBeTruthy();
      const pushLogValue: DeliveryLog = pushDeliveryLog!.value;
      expect(pushLogValue).toMatchObject({
        notification_id: notificationId,
        event_name: 'PAYMENT_REMINDER',
        channel_name: 'PUSH',
        stage: 'routed',
        status: 'pending',
      });

      // Verify successful delivery log for PUSH channel
      const pushSuccessLog = await kafkaHelper.waitForMessage(
        KAFKA_TOPICS.DELIVERY_LOGS,
        20000,
        (msg) => msg.value?.notification_id === notificationId && 
                 msg.value?.channel_name === 'PUSH' && 
                 msg.value?.stage === 'provider_success' &&
                 msg.value?.status === 'success'
      );
      expect(pushSuccessLog).toBeTruthy();
      const pushSuccessValue: DeliveryLog = pushSuccessLog!.value;
      expect(pushSuccessValue).toMatchObject({
        notification_id: notificationId,
        event_name: 'PAYMENT_REMINDER',
        channel_name: 'PUSH',
        stage: 'provider_success',
        status: 'success',
      });
      expect(pushSuccessValue.provider_request_id).toBe(notificationId);
      expect(pushSuccessValue.message_id).toBeDefined();

      // Verify NO message is sent to EMAIL_NOTIFICATION topic
      // Wait a bit to ensure no email message arrives
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const emailMessages = kafkaHelper.getMessages(KAFKA_TOPICS.EMAIL_NOTIFICATION);
      const emailMessageForThisNotification = emailMessages.find(
        (msg) => msg.value?.notification_id === notificationId
      );
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

      const response = await request(app.getHttpServer())
        .post('/notifications/send')
        .send(payload)
        .expect(202);

      expect(response.body.success).toBe(true);

      // Wait for message on notification topic
      const notificationMessage = await kafkaHelper.waitForMessage(
        KAFKA_TOPICS.NOTIFICATION,
        10000,
        (msg) => msg.value?.notification_id === notificationId
      );

      expect(notificationMessage).toBeTruthy();
      const messageValue: NotificationMessage = notificationMessage?.value;
      expect(messageValue.event_name).toBe('SHIPPING_UPDATE');
      expect(messageValue.rendered_templates).toHaveLength(1);
      expect(messageValue.rendered_templates[0].channel_name).toBe('PUSH');
      expect(messageValue.rendered_templates.some((t) => t.channel_name === 'EMAIL')).toBe(false);

      // Verify message is routed to PUSH_NOTIFICATION topic (only PUSH, not EMAIL)
      const pushMessage = await kafkaHelper.waitForMessage(
        KAFKA_TOPICS.PUSH_NOTIFICATION,
        15000,
        (msg) => msg.value?.notification_id === notificationId && msg.value?.channel_name === 'PUSH'
      );
      expect(pushMessage).toBeTruthy();
      expect(pushMessage?.topic).toBe(KAFKA_TOPICS.PUSH_NOTIFICATION);
      const pushValue: ChannelMessage = pushMessage!.value;
      expect(pushValue).toMatchObject({
        notification_id: notificationId,
        event_name: 'SHIPPING_UPDATE',
        channel_name: 'PUSH',
        recipient: 'user123',
        template_content: 'Shipping update: Your order #ORD123 has been shipped',
      });

      // Verify delivery log for PUSH channel
      const pushDeliveryLog = await kafkaHelper.waitForMessage(
        KAFKA_TOPICS.DELIVERY_LOGS,
        15000,
        (msg) => msg.value?.notification_id === notificationId && 
                 msg.value?.channel_name === 'PUSH' && 
                 msg.value?.stage === 'routed'
      );
      expect(pushDeliveryLog).toBeTruthy();
      const pushLogValue: DeliveryLog = pushDeliveryLog!.value;
      expect(pushLogValue).toMatchObject({
        notification_id: notificationId,
        event_name: 'SHIPPING_UPDATE',
        channel_name: 'PUSH',
        stage: 'routed',
        status: 'pending',
      });

      // Verify successful delivery log for PUSH channel
      const pushSuccessLog = await kafkaHelper.waitForMessage(
        KAFKA_TOPICS.DELIVERY_LOGS,
        20000,
        (msg) => msg.value?.notification_id === notificationId && 
                 msg.value?.channel_name === 'PUSH' && 
                 msg.value?.stage === 'provider_success' &&
                 msg.value?.status === 'success'
      );
      expect(pushSuccessLog).toBeTruthy();
      const pushSuccessValue: DeliveryLog = pushSuccessLog!.value;
      expect(pushSuccessValue).toMatchObject({
        notification_id: notificationId,
        event_name: 'SHIPPING_UPDATE',
        channel_name: 'PUSH',
        stage: 'provider_success',
        status: 'success',
      });
      expect(pushSuccessValue.provider_request_id).toBe(notificationId);
      expect(pushSuccessValue.message_id).toBeDefined();

      // Verify NO message is sent to EMAIL_NOTIFICATION topic
      // Wait a bit to ensure no email message arrives
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const emailMessages = kafkaHelper.getMessages(KAFKA_TOPICS.EMAIL_NOTIFICATION);
      const emailMessageForThisNotification = emailMessages.find(
        (msg) => msg.value?.notification_id === notificationId
      );
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

      await request(app.getHttpServer())
        .post('/notifications/send')
        .send(payload)
        .expect(404);
    });

    it('should return 400 for missing required fields', async () => {
      const payload = {
        notification_id: `test-missing-${Date.now()}`,
        event_type: 'CHAT_MESSAGE',
        data: {
          // Missing required fields
        },
      };

      await request(app.getHttpServer())
        .post('/notifications/send')
        .send(payload)
        .expect(400);
    });

    it('should validate request body structure', async () => {
      const payload = {
        // Missing notification_id
        event_type: 'CHAT_MESSAGE',
        data: {},
      };

      await request(app.getHttpServer())
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

      await request(app.getHttpServer())
        .post('/notifications/send')
        .send(payload)
        .expect(202);

      const messages = await kafkaHelper.waitForMessage(
        KAFKA_TOPICS.NOTIFICATION,
        10000,
        (msg) => msg.value?.notification_id === notificationId
      );

      expect(messages).toBeTruthy();
      expect(messages?.topic).toBe(KAFKA_TOPICS.NOTIFICATION);
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

      await request(app.getHttpServer())
        .post('/notifications/send')
        .send(payload)
        .expect(202);

      // Verify message in notification topic
      const notificationMessage = await kafkaHelper.waitForMessage(
        KAFKA_TOPICS.NOTIFICATION,
        10000,
        (msg) => msg.value?.notification_id === notificationId
      );
      expect(notificationMessage).toBeTruthy();

      // Verify message in PUSH_NOTIFICATION topic
      const pushMessage = await kafkaHelper.waitForMessage(
        KAFKA_TOPICS.PUSH_NOTIFICATION,
        15000,
        (msg) => msg.value?.notification_id === notificationId && msg.value?.channel_name === 'PUSH'
      );
      expect(pushMessage).toBeTruthy();
      expect(pushMessage?.topic).toBe(KAFKA_TOPICS.PUSH_NOTIFICATION);
      expect(pushMessage?.key).toBe(notificationId);
      const pushValue: ChannelMessage = pushMessage!.value;
      expect(pushValue).toMatchObject({
        notification_id: notificationId,
        channel_name: 'PUSH',
        recipient: 'user123',
        template_content: 'New message from John Doe: Test routing',
      });

      // Verify message in EMAIL_NOTIFICATION topic
      const emailMessage = await kafkaHelper.waitForMessage(
        KAFKA_TOPICS.EMAIL_NOTIFICATION,
        15000,
        (msg) => msg.value?.notification_id === notificationId && msg.value?.channel_name === 'EMAIL'
      );
      expect(emailMessage).toBeTruthy();
      expect(emailMessage?.topic).toBe(KAFKA_TOPICS.EMAIL_NOTIFICATION);
      expect(emailMessage?.key).toBe(notificationId);
      const emailValue: ChannelMessage = emailMessage!.value;
      expect(emailValue).toMatchObject({
        notification_id: notificationId,
        channel_name: 'EMAIL',
        recipient: 'jane@example.com',
        template_content: '<h1>New Message</h1><p>Hi Jane Doe,</p><p>You have a new message from John Doe:</p><p>Test routing</p>',
        template_subject: 'New Message from John Doe',
      });

      // Verify delivery logs are published
      const allDeliveryLogs = kafkaHelper.getMessages(KAFKA_TOPICS.DELIVERY_LOGS);
      const routingLogs = allDeliveryLogs.filter(
        (msg) => msg.value?.notification_id === notificationId && msg.value?.stage === 'routed'
      );
      
      // Should have 2 delivery logs (one for PUSH, one for EMAIL)
      expect(routingLogs.length).toBeGreaterThanOrEqual(2);
      
      const pushLog = routingLogs.find((msg) => msg.value?.channel_name === 'PUSH');
      expect(pushLog).toBeTruthy();
      expect(pushLog!.value).toMatchObject({
        notification_id: notificationId,
        channel_name: 'PUSH',
        stage: 'routed',
        status: 'pending',
      });

      const emailLog = routingLogs.find((msg) => msg.value?.channel_name === 'EMAIL');
      expect(emailLog).toBeTruthy();
      expect(emailLog!.value).toMatchObject({
        notification_id: notificationId,
        channel_name: 'EMAIL',
        stage: 'routed',
        status: 'pending',
      });

      // Verify successful delivery logs (provider_success)
      // Note: This requires push and email workers to be running
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for workers to process
      
      const allLogs = kafkaHelper.getMessages(KAFKA_TOPICS.DELIVERY_LOGS);
      const successLogs = allLogs.filter(
        (msg) => msg.value?.notification_id === notificationId && 
                 msg.value?.stage === 'provider_success' &&
                 msg.value?.status === 'success'
      );

      const pushSuccessLog = successLogs.find((msg) => msg.value?.channel_name === 'PUSH');
      expect(pushSuccessLog).toBeTruthy();
      expect(pushSuccessLog!.value).toMatchObject({
        notification_id: notificationId,
        channel_name: 'PUSH',
        stage: 'provider_success',
        status: 'success',
      });
      expect(pushSuccessLog!.value.provider_request_id).toBe(notificationId);
      expect(pushSuccessLog!.value.message_id).toBeDefined();

      const emailSuccessLog = successLogs.find((msg) => msg.value?.channel_name === 'EMAIL');
      expect(emailSuccessLog).toBeTruthy();
      expect(emailSuccessLog!.value).toMatchObject({
        notification_id: notificationId,
        channel_name: 'EMAIL',
        stage: 'provider_success',
        status: 'success',
      });
      expect(emailSuccessLog!.value.provider_request_id).toBe(notificationId);
      expect(emailSuccessLog!.value.message_id).toBeDefined();
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

      await request(app.getHttpServer())
        .post('/notifications/send')
        .send(payload)
        .expect(202);

      const message = await kafkaHelper.waitForMessage(
        KAFKA_TOPICS.NOTIFICATION,
        10000,
        (msg) => msg.value?.notification_id === notificationId
      );

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

      await request(app.getHttpServer())
        .post('/notifications/send')
        .send(payload)
        .expect(202);

      const message = await kafkaHelper.waitForMessage(
        KAFKA_TOPICS.NOTIFICATION,
        10000,
        (msg) => msg.value?.notification_id === notificationId
      );

      const messageValue: NotificationMessage = message?.value;
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

