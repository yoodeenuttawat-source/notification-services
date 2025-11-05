# System Design

## Overview

This document describes the system design for the Notification Services application, including data flow, architecture assumptions, and monitoring metrics.

## System Architecture Diagram

![System Design](./SystemDesign.png)

## Data Flow

1. **Internal Service Requests**: Internal services (chat, order, etc.) call the notification API to send notifications for specific event types. The supported events and their channel mappings are:
   - **CHAT_MESSAGE**: PUSH ✅, EMAIL ✅
   - **PURCHASE**: PUSH ✅, EMAIL ✅
   - **PAYMENT_REMINDER**: PUSH ✅, EMAIL ❌
   - **SHIPPING_UPDATE**: PUSH ✅, EMAIL ❌

2. **Notification API Processing**:
   - Validates the body payload
   - Gets the available channels for the event type
   - Selects template based on database configuration
   - Substitutes data into templates (pre-renders templates for all channels)
   - Publishes event to `notification` topic with all pre-rendered templates

3. **Splitter Worker**:
   - Consumes messages from `notification` topic
   - Checks for message duplication using LRU cache (skips if duplicated)
   - Marks message as processed to prevent duplicates (TTL: 2 minutes)
   - Validates message has rendered templates
   - Splits message: For each pre-rendered template, publishes individual `ChannelMessage` to respective channel topic (`notification.email` or `notification.push`)
   - Publishes delivery logs for each channel routing action

4. **Channel Workers (Email & Push)**:
   - Consume messages from their respective topics
   - Get list of available providers sorted by priority
   - Call provider APIs in priority order (failover to next if first fails)
   - Publish events to `provider_request_response` topic for each API call
   - Send status updates to `delivery_logs`

5. **Error Handling**:
   - If any worker fails to process a message:
     - **Retryable errors** (e.g., network failures, provider timeouts): Published to DLQ for retry
     - **Non-retryable errors** (e.g., invalid data, missing required fields): Published to DLQ with metadata indicating no retry, and delivery log is updated with failure status
   - Each worker publishes delivery logs with error details for tracking

6. **Kafka Message Failure Handling**:
   - If any Kafka message fails to send, it will be written to disk
   - A separate process reads from disk and resends to Kafka
   - This mechanism works when running on dedicated nodes/servers

7. **Kafka Connector**:
   - Subscribes to all topics to build tables from events
   - Provides event sourcing and data persistence

## Assumptions

1. **Scalability & Reliability**:
   - System needs to handle **100k notifications per minute** (1667 notifications per second)
   - Focus on reliability
   - Event sourcing can achieve this in one transaction
   - **Decision: Event Sourcing** - Chosen because the bottleneck will be Kafka, which supports high throughput. Outbox pattern has limitations on database.

2. **Provider Idempotency**:
   - All providers support idempotent keys
   - Can retry multiple times without worrying about duplicate notifications to users

3. **Provider Response**:
   - Providers respond with 'sent' status instantly
   - No need to handle webhooks/callbacks

4. **Status Tracking**:
   - Ignore 'read' and 'click' status to reduce scope

5. **Device Tokens**:
   - Don't need to send device tokens for each push provider (can be added later with one API call)

6. **Channel Configuration**:
   - System decides the channel for each event type
   - Configuration is stored in database
   - Backoffice can be added in the future

7. **Duplicate Notifications**:
   - System allows duplicated notifications
   - Users may receive duplicate notifications

8. **Runtime Configuration**:
   - Channel configuration for each event can be changed at runtime
   - For messages already in `notification` topic, channel configuration cannot be changed (already validated at API level)
   - This design choice avoids increasing system complexity

9. **Priority Handling**:
   - High priority notifications are ignored for now
   - Can be added later by:
     - Adding priority field to notification event
     - Letting splitter worker handle priority routing

## Monitoring Metrics

### Prometheus Metrics

All metrics are exposed via the `/metrics` endpoint on the Notification API (default: `http://localhost:3000/metrics`).

1. **Notification API Metrics** (`notification_api_request_duration_seconds`):
   - Request duration (histogram with buckets)
   - Request count (derived from histogram)
   - Request per minute (derived from histogram)
   - Labels: `method`, `url`, `httpStatus`
   - **Alert thresholds**: P95 latency exceeds threshold, success rate drops below 99%

2. **Worker Processing Metrics** (`worker_processing_duration_seconds`):
   - Processing duration (histogram with buckets)
   - Processing count (derived from histogram)
   - Success rate (derived from histogram)
   - Labels: `worker`, `topic`, `status`
   - **Alert thresholds**: P95 latency exceeds threshold, success rate drops below 99%

3. **Provider API Metrics** (`provider_api_duration_seconds`):
   - API call duration (histogram with buckets)
   - API call count (derived from histogram)
   - Success rate (derived from histogram)
   - Labels: `provider`, `channel`, `status`
   - **Alert thresholds**: P95 latency exceeds threshold, success rate drops below 99%

4. **Circuit Breaker Metrics** (`circuit_breaker_state`):
   - Circuit breaker state (gauge: 0=CLOSED, 1=OPEN, 2=HALF_OPEN)
   - Labels: `provider`
   - **Alert thresholds**: Alert when circuit breaker is OPEN

5. **Kafka Metrics**:
   - **Publish Metrics** (`kafka_publish_duration_seconds`): Duration and count for publish operations
     - Success rate per topic (derived from histogram)
     - Response time per topic (histogram)
     - Labels: `topic`, `status`
     - **Alert thresholds**: Success rate drops below 100%, P95 response time exceeds threshold
   - **Consume Metrics** (`kafka_consume_duration_seconds`): Duration and count for consume operations
     - Labels: `topic`, `consumer_group`

6. **Database Metrics** (`database_query_duration_seconds`):
   - Query duration (histogram with buckets)
   - Query count (derived from histogram)
   - Success rate (derived from histogram)
   - Labels: `operation`, `status`
   - **Alert thresholds**: P95 latency exceeds threshold, success rate drops below 100%

7. **DLQ Metrics** (`dlq_replay_total`):
   - Total number of DLQ messages replayed (counter)
   - DLQ message count (derived from counter)
   - Processing rate (derived from counter)
   - Labels: `topic`, `status`
   - **Alert thresholds**: DLQ message count exceeds threshold

### Infrastructure Metrics

1. **Service Metrics**:
   - CPU usage
   - Memory usage
   - Disk usage
   - Network usage

2. **Kafka Metrics**:
   - Kafka lag for each topic consumer group

3. **Database Metrics**:
   - Connection count
   - CPU usage
   - Memory usage
   - Disk usage
   - Network usage

4. **API Gateway Metrics**:
   - Latency
   - Success rate

## Testing

### Unit Test Coverage

- **Line Coverage**: 90%
- **Branch Coverage**: 90%

**Command:**
```bash
yarn test:cov
```

### Integration Test

**Command:**
```bash
yarn test:e2e
```

### Load Test

**Command:**
```bash
yarn test:load
```

## Architecture Components

### Services

- **Notification API**: REST API endpoint for receiving notification requests, validates payloads, renders templates, and publishes to Kafka
- **Splitter Worker**: Consumes from `notification` topic, deduplicates messages, and routes pre-rendered templates to channel-specific topics
- **Email Worker**: Consumes from `notification.email` topic, handles provider failover for email notifications
- **Push Worker**: Consumes from `notification.push` topic, handles provider failover for push notifications
- **DLQ Replay Worker**: Replays messages from Dead Letter Queue topics for retry

### Key Technologies

- **NestJS**: Framework for building scalable Node.js applications
- **PostgreSQL**: Database for configuration (templates, events, channels, providers) and event storage via Kafka connector
- **Kafka**: Event streaming platform for message processing and event sourcing
- **Circuit Breaker**: Prevents cascading failures when calling external providers
- **LRU Cache**: In-memory caching with concurrent access support for:
  - Configuration data (templates, events, channels, providers) - refreshed periodically
  - Message deduplication (TTL: 2 minutes per notification)
- **Prometheus**: Metrics collection and monitoring via `prom-client` library

### Data Flow Diagram

```
Internal Services
    ↓
Notification API (Validates Payload, Renders Templates)
    ↓
Kafka Topic: notification (with pre-rendered templates)
    ↓
Splitter Worker (Deduplication via LRU Cache & Channel Routing)
    ↓
Kafka Topics: notification.email, notification.push (individual ChannelMessages)
    ↓
Email Worker / Push Worker (Provider Failover with Circuit Breaker)
    ↓
External Providers (Email/Push Services)
    ↓
Kafka Topics:
    - delivery_logs (all stages: routing, provider calls, failures)
    - provider_request_response (detailed provider API interactions)
    ↓
Kafka Connector (Event Sourcing)
    ↓
PostgreSQL Database Tables
```

## Configuration

Configuration is stored in the `migrations/` folder. Database migrations contain the initial configuration for templates, events, channels, and providers.

