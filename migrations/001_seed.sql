-- Migration: 001_seed.sql
-- Seeds initial data for the notification service

BEGIN;

-- Insert event types
INSERT INTO event_types (name, created_by) VALUES
  ('CHAT_MESSAGE', 'system'),
  ('PURCHASE', 'system'),
  ('PAYMENT_REMINDER', 'system'),
  ('SHIPPING_UPDATE', 'system')
ON CONFLICT (name) DO NOTHING;

-- Insert channel types
INSERT INTO channel_types (channel, created_by) VALUES
  ('PUSH', 'system'),
  ('EMAIL', 'system')
ON CONFLICT (channel) DO NOTHING;

-- Insert templates (using subqueries to get IDs)
INSERT INTO templates (event_id, channel_id, name, subject, content, variables, required_fields, created_by)
SELECT 
  et.event_id,
  ct.channel_id,
  t.name,
  t.subject,
  t.content,
  t.variables::jsonb,
  t.required_fields::jsonb,
  'system'
FROM (VALUES
  ('CHAT_MESSAGE', 'PUSH', 'Chat Message Push Notification', NULL, 'New message from {{sender_name}}: {{message_preview}}', '{"sender_name": "string", "message_preview": "string"}'::jsonb, '["sender_name", "message_preview", "user_id"]'::jsonb),
  ('CHAT_MESSAGE', 'EMAIL', 'Chat Message Email', 'New Message from {{sender_name}}', '<h1>New Message</h1><p>Hi {{user_name}},</p><p>You have a new message from {{sender_name}}:</p><p>{{message_preview}}</p>', '{"sender_name": "string", "message_preview": "string", "user_name": "string"}'::jsonb, '["sender_name", "message_preview", "user_name", "user_email"]'::jsonb),
  ('PURCHASE', 'PUSH', 'Purchase Push Notification', NULL, 'Your purchase #{{order_id}} has been confirmed!', '{"order_id": "string"}'::jsonb, '["order_id", "user_id"]'::jsonb),
  ('PURCHASE', 'EMAIL', 'Purchase Confirmation Email', 'Purchase Confirmation - Order #{{order_id}}', '<h1>Purchase Confirmed</h1><p>Hi {{user_name}},</p><p>Your purchase #{{order_id}} has been confirmed!</p><p>Total: {{total_amount}}</p>', '{"order_id": "string", "user_name": "string", "total_amount": "number"}'::jsonb, '["order_id", "user_name", "total_amount", "user_email"]'::jsonb),
  ('PAYMENT_REMINDER', 'PUSH', 'Payment Reminder Push Notification', NULL, 'Reminder: Payment due for order #{{order_id}}', '{"order_id": "string"}'::jsonb, '["order_id", "user_id"]'::jsonb),
  ('SHIPPING_UPDATE', 'PUSH', 'Shipping Update Push Notification', NULL, 'Shipping update: Your order #{{order_id}} has been {{status}}', '{"order_id": "string", "status": "string"}'::jsonb, '["order_id", "status", "user_id"]'::jsonb)
) AS t(event_name, channel_name, name, subject, content, variables, required_fields)
JOIN event_types et ON et.name = t.event_name
JOIN channel_types ct ON ct.channel = t.channel_name
ON CONFLICT (event_id, channel_id) DO UPDATE
SET 
  name = EXCLUDED.name,
  subject = EXCLUDED.subject,
  content = EXCLUDED.content,
  variables = EXCLUDED.variables,
  required_fields = EXCLUDED.required_fields,
  updated_at = CURRENT_TIMESTAMP,
  updated_by = EXCLUDED.created_by;

-- Insert providers
INSERT INTO providers (name, channel_id, priority, created_by)
SELECT 
  p.name,
  ct.channel_id,
  p.priority,
  'system'
FROM (VALUES
  ('PushProvider1', 'PUSH', 1),
  ('PushProvider2', 'PUSH', 2),
  ('EmailProvider1', 'EMAIL', 1),
  ('EmailProvider2', 'EMAIL', 2)
) AS p(name, channel_name, priority)
JOIN channel_types ct ON ct.channel = p.channel_name
ON CONFLICT (name, channel_id) DO UPDATE
SET 
  priority = EXCLUDED.priority,
  updated_at = CURRENT_TIMESTAMP,
  updated_by = EXCLUDED.created_by;

-- Insert event-channel mappings
INSERT INTO event_channel_mapping (event_id, channel_id, created_by)
SELECT 
  et.event_id,
  ct.channel_id,
  'system'
FROM (VALUES
  ('CHAT_MESSAGE', 'PUSH'),
  ('CHAT_MESSAGE', 'EMAIL'),
  ('PURCHASE', 'PUSH'),
  ('PURCHASE', 'EMAIL'),
  ('PAYMENT_REMINDER', 'PUSH'),
  ('SHIPPING_UPDATE', 'PUSH')
) AS m(event_name, channel_name)
JOIN event_types et ON et.name = m.event_name
JOIN channel_types ct ON ct.channel = m.channel_name
ON CONFLICT (event_id, channel_id) DO NOTHING;

COMMIT;

