-- Migration: 000_schema.sql
-- Creates all database tables for the notification service

-- Create migrations table to track executed migrations
CREATE TABLE IF NOT EXISTS migrations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_migrations_name ON migrations(name);

-- Create event_types table
CREATE TABLE IF NOT EXISTS event_types (
  event_id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  rec_status BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  updated_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_event_types_name ON event_types(name);
CREATE INDEX IF NOT EXISTS idx_event_types_rec_status ON event_types(rec_status);

-- Create channel_types table
CREATE TABLE IF NOT EXISTS channel_types (
  channel_id SERIAL PRIMARY KEY,
  channel VARCHAR(50) NOT NULL UNIQUE,
  rec_status BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  updated_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_channel_types_channel ON channel_types(channel);
CREATE INDEX IF NOT EXISTS idx_channel_types_rec_status ON channel_types(rec_status);

-- Create templates table
CREATE TABLE IF NOT EXISTS templates (
  template_id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES event_types(event_id) ON DELETE CASCADE,
  channel_id INTEGER NOT NULL REFERENCES channel_types(channel_id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  subject TEXT,
  content TEXT NOT NULL,
  variables JSONB DEFAULT '{}'::jsonb,
  required_fields JSONB DEFAULT '[]'::jsonb,
  rec_status BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  updated_by VARCHAR(255),
  UNIQUE(event_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_templates_event_id ON templates(event_id);
CREATE INDEX IF NOT EXISTS idx_templates_channel_id ON templates(channel_id);
CREATE INDEX IF NOT EXISTS idx_templates_event_channel ON templates(event_id, channel_id);
CREATE INDEX IF NOT EXISTS idx_templates_rec_status ON templates(rec_status);

-- Create providers table
CREATE TABLE IF NOT EXISTS providers (
  provider_id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  channel_id INTEGER NOT NULL REFERENCES channel_types(channel_id) ON DELETE CASCADE,
  priority INTEGER NOT NULL,
  rec_status BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  updated_by VARCHAR(255),
  UNIQUE(name, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_providers_channel_id ON providers(channel_id);
CREATE INDEX IF NOT EXISTS idx_providers_channel_priority ON providers(channel_id, priority);
CREATE INDEX IF NOT EXISTS idx_providers_rec_status ON providers(rec_status);

-- Create event_channel_mapping table
CREATE TABLE IF NOT EXISTS event_channel_mapping (
  mapping_id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES event_types(event_id) ON DELETE CASCADE,
  channel_id INTEGER NOT NULL REFERENCES channel_types(channel_id) ON DELETE CASCADE,
  rec_status BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  updated_by VARCHAR(255),
  UNIQUE(event_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_event_channel_mapping_event_id ON event_channel_mapping(event_id);
CREATE INDEX IF NOT EXISTS idx_event_channel_mapping_channel_id ON event_channel_mapping(channel_id);
CREATE INDEX IF NOT EXISTS idx_event_channel_mapping_event_channel ON event_channel_mapping(event_id, channel_id);
CREATE INDEX IF NOT EXISTS idx_event_channel_mapping_rec_status ON event_channel_mapping(rec_status);

