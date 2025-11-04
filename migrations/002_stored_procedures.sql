-- Migration: 002_stored_procedures.sql
-- Creates stored procedures for notification service queries

BEGIN;

-- Stored procedure: Get all templates
CREATE OR REPLACE FUNCTION get_all_templates()
RETURNS TABLE(
  template_id INTEGER,
  event_id INTEGER,
  channel_id INTEGER,
  name VARCHAR(255),
  subject TEXT,
  content TEXT,
  variables JSONB,
  required_fields JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.template_id,
    t.event_id,
    t.channel_id,
    t.name,
    t.subject,
    t.content,
    t.variables,
    t.required_fields
  FROM templates t
  WHERE t.rec_status = true;
END;
$$ LANGUAGE plpgsql;

-- Stored procedure: Get all event-channel mappings
CREATE OR REPLACE FUNCTION get_all_event_channel_mappings()
RETURNS TABLE(
  event_id INTEGER,
  event_name VARCHAR(255),
  channel_id INTEGER,
  channel_name VARCHAR(50)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ecm.event_id,
    et.name AS event_name,
    ecm.channel_id,
    ct.channel AS channel_name
  FROM event_channel_mapping ecm
  JOIN event_types et ON ecm.event_id = et.event_id
  JOIN channel_types ct ON ecm.channel_id = ct.channel_id
  WHERE ecm.rec_status = true;
END;
$$ LANGUAGE plpgsql;

-- Stored procedure: Get all providers
CREATE OR REPLACE FUNCTION get_all_providers()
RETURNS TABLE(
  provider_id INTEGER,
  name VARCHAR(255),
  channel_id INTEGER,
  priority INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.provider_id,
    p.name,
    p.channel_id,
    p.priority
  FROM providers p
  WHERE p.rec_status = true
  ORDER BY p.channel_id, p.priority;
END;
$$ LANGUAGE plpgsql;

-- Stored procedure: Get all events
CREATE OR REPLACE FUNCTION get_all_events()
RETURNS TABLE(
  event_id INTEGER,
  name VARCHAR(255)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    et.event_id,
    et.name
  FROM event_types et
  WHERE et.rec_status = true;
END;
$$ LANGUAGE plpgsql;

-- Stored procedure: Get all channels
CREATE OR REPLACE FUNCTION get_all_channels()
RETURNS TABLE(
  channel_id INTEGER,
  channel VARCHAR(50)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ct.channel_id,
    ct.channel
  FROM channel_types ct
  WHERE ct.rec_status = true;
END;
$$ LANGUAGE plpgsql;

COMMIT;

