# System Design

## Overview

This document describes the system design for the Notification Services application, including data flow, architecture assumptions, and monitoring metrics. The system is designed as an event-driven, scalable notification service that handles multi-channel notifications (EMAIL and PUSH) with provider failover, circuit breakers, and comprehensive event sourcing.

## System Architecture Diagram

![System Design](./SystemDesign.png)

## Data Flow

### 1. Internal Service Requests

Internal services (chat, order, payment, shipping, etc.) call the Notification API to send notifications for specific event types. The supported events are:

- **CHAT_MESSAGE**: PUSH ✅, EMAIL ✅
- **PURCHASE**: PUSH ✅, EMAIL ✅
- **PAYMENT_REMINDER**: PUSH ✅, EMAIL ❌
- **SHIPPING_UPDATE**: PUSH ✅, EMAIL ❌

### 2. Notification API Processing

The Notification API performs the following steps:

- Validates the body payload
- Gets the available channels for the event type from database configuration
- Selects template based on database configuration
- Substitutes data into templates (pre-renders templates for all channels)
- Publishes event to `notification` topic with all pre-rendered templates
- Publishes initial delivery log to `delivery_logs` topic

**Output Topics:**
- `notification` - Main notification topic with pre-rendered templates
- `delivery_logs` - Initial delivery log entry

### 3. Splitter Worker Processing

The Splitter Worker consumes messages from `notification` topic and performs the following:

- Checks if message is duplicated or not using LRU cache
  - **If duplicated**: Skips this message (prevents duplicate processing)
  - **If not duplicated**: Processes message normally
- Marks message as processed to prevent duplicates (TTL: 2 minutes)
- Validates message has rendered templates
- Splits message based on supported channels (email, push)
- For each supported channel, publishes individual `ChannelMessage` to respective channel topic:
  - `notification.email` - For email notifications
  - `notification.push` - For push notifications
- Publishes delivery logs for each channel routing action to `delivery_logs` topic

**Output Topics:**
- `notification.email` - Individual email channel messages
- `notification.push` - Individual push channel messages
- `delivery_logs` - Channel routing logs

### 4. Channel Workers (Email & Push)

Both Email Worker and Push Worker follow the same processing pattern:

**For each channel (Email/Push):**

1. **Consume Messages**: Worker consumes messages from its respective topic (`notification.email` or `notification.push`)

2. **Get Provider List**: Gets list of available providers sorted by priority from database configuration

3. **Provider Failover**: Calls provider APIs in the order of priority:
   - Attempts to send via Provider 1
   - **If the first one is not successful**: Automatically fails over to Provider 2
   - Continues failover chain (Provider 3, Provider 4, ..., Provider X) until success or all providers exhausted
   - Circuit breaker prevents cascading failures when providers are down

4. **Logging**: For every provider API call:
   - Publishes event to `provider_request_response` topic with detailed request/response data
   - Sends status to `delivery_logs` topic

**Email Worker Output Topics:**
- `provider_request_response` - All email provider API interactions
- `delivery_logs` - Email worker processing status

**Push Worker Output Topics:**
- `provider_request_response` - All push provider API interactions
- `delivery_logs` - Push worker processing status

**External Providers:**
- **Email Providers**: Email Provider 1, Email Provider 2, Email Provider 3, ..., Email Provider X
- **Push Providers**: Push Provider 1, Push Provider 2, Push Provider 3, ..., Push Provider X

### 5. Error Handling and Dead Letter Queue (DLQ)

If any worker processes the message and it fails, errors are separated into two types:

**Retryable Messages** (e.g., network failures, provider timeouts, temporary service unavailability):
- Published to Dead Letter Queue (DLQ) for retry
- DLQ topics: `notification.dlq`, `notification.email.dlq`, `notification.push.dlq`
- DLQ Replay Worker can replay these messages later

**Non-Retryable Messages** (e.g., invalid data, missing required fields, authentication failures):
- Published to DLQ with metadata indicating no retry
- Delivery log is updated with failure status
- No automatic replay attempted

Each worker publishes delivery logs with error details for tracking and debugging.

### 6. Kafka Message Failure Handling

If any Kafka message fails to send, the system handles it as follows:

- Failed messages are written to the disk
- A separate process reads from disk and resends to Kafka
- This mechanism works when running on dedicated nodes/servers
- Ensures message delivery reliability even when Kafka is temporarily unavailable

### 7. Kafka Connector and Event Sourcing

The Kafka Connector subscribes to all topics to build tables from events:

- Consumes from `delivery_logs` topic - Builds delivery tracking tables
- Consumes from `provider_request_response` topic - Builds provider interaction tables
- Provides event sourcing and data persistence
- Writes data to PostgreSQL database (or other database depending on use cases)
- Enables historical analysis and audit trails

### 8. Feedback to Internal Services

Internal services can consume from `delivery_logs` topic to:

- Track notification delivery status in real-time
- Monitor delivery success/failure rates
- Get updates on notification processing stages
- Build real-time dashboards and notifications

## Assumptions

1. **Scalability & Reliability**:
   - System needs to handle **100k notifications per minute** (1667 notifications per second)
   - Focus on reliability
   - Event sourcing can achieve this in one transaction
   - **Decision: Event Sourcing** - Chosen because the bottleneck will be Kafka, which supports high throughput.

2. **Provider Idempotency**:
   - All providers support idempotent keys
   - Can retry multiple times without worrying about duplicate notifications to users
   - Enables safe failover and retry mechanisms

3. **Provider Response**:
   - Providers respond with 'sent' status instantly
   - No need to handle webhooks/callbacks
   - Synchronous API responses are sufficient

4. **Status Tracking**:
   - Ignore 'read' and 'click' status to reduce scope
   - Focus on delivery status only
   - Can be extended later if needed

5. **Device Tokens**:
   - Don't need to send device tokens for each push provider
   - Can be added later with one API call
   - Simplifies initial implementation

6. **Channel Configuration**:
   - System decides the channel for each event type
   - Configuration is stored in database
   - Backoffice can be added in the future for runtime configuration

7. **Duplicate Notifications**:
   - System allows duplicated notifications as a design trade-off
   - Users may receive duplicate notifications in edge cases
   - LRU cache provides 2-minute deduplication window

8. **Runtime Configuration**:
   - Channel configuration for each event can be changed at runtime
   - For messages already in `notification` topic, channel configuration cannot be changed (already validated at API level)
   - This design choice avoids increasing system complexity

9. **Priority Handling**:
   - High priority notifications are ignored for now
   - Can be added later by:
     - Adding priority field to notification event
     - Letting splitter worker handle priority routing

## Kafka Topics

### Main Topics

- **`notification`**: Main notification topic (from API)
  - Contains pre-rendered templates for all channels
  - Consumed by: Splitter Worker
  - Also publishes to: `delivery_logs` (notification publishing event)

- **`notification.email`**: Email notification topic
  - Individual email channel messages
  - Consumed by: Email Worker
  - Created by: Splitter Worker

- **`notification.push`**: Push notification topic
  - Individual push channel messages
  - Consumed by: Push Worker
  - Created by: Splitter Worker

### Logging Topics

- **`delivery_logs`**: Central logging topic
  - Receives logs from: `notification` topic, Splitter Worker, Email Worker, Push Worker
  - All stages: API publishing, splitter routing, worker processing, provider calls, failures
  - Consumed by: Internal Services (for feedback), Kafka Connector (for persistence)

- **`provider_request_response`**: Provider interaction topic
  - Detailed provider API request/response data
  - Receives messages from: Email Worker, Push Worker
  - Consumed by: Kafka Connector (for persistence)

### Dead Letter Queue Topics

- **`notification.dlq`**: DLQ for notification topic
- **`notification.email.dlq`**: DLQ for email topic
- **`notification.push.dlq`**: DLQ for push topic
- Consumed by: DLQ Replay Worker

## Monitoring Metrics

### Prometheus Metrics

All metrics are exposed via the `/metrics` endpoint on the Notification API (default: `http://localhost:3000/metrics`).

1. **Provider API Metrics** (`provider_api_duration_seconds`):
   - Provider API call success rate and latency
   - Labels: `provider`, `channel`, `status`
   - **Alert thresholds**: P95 latency exceeds threshold, success rate drops below 99%

2. **Circuit Breaker Metrics** (`circuit_breaker_state`):
   - Circuit breaker status (open/close)
   - Labels: `provider`
   - **Alert thresholds**: Alert when circuit breaker is OPEN

3. **Notification API Metrics** (`notification_api_request_duration_seconds`):
   - Notification API request per minute, latency, success rate
   - Labels: `method`, `url`, `httpStatus`
   - **Alert thresholds**: P95 latency exceeds threshold, success rate drops below 99%

4. **Kafka Metrics**:
   - **Publish Metrics** (`kafka_publish_duration_seconds`): Kafka success rate per topic, response time per topic
     - Labels: `topic`, `status`
     - **Alert thresholds**: Success rate drops below 100%, P95 response time exceeds threshold
   - **Consume Metrics** (`kafka_consume_duration_seconds`): Duration and count for consume operations
     - Labels: `topic`, `consumer_group`

5. **Database Metrics** (`database_query_duration_seconds`):
   - Database latency and success rate
   - Labels: `operation`, `status`
   - **Alert thresholds**: P95 latency exceeds threshold, success rate drops below 100%

6. **DLQ Metrics** (`dlq_replay_total`):
   - DLQ message count and processing rate
   - Labels: `topic`, `status`
   - **Alert thresholds**: DLQ message count exceeds threshold

7. **Worker Processing Metrics** (`worker_processing_duration_seconds`):
   - Worker processing time and success rate
   - Labels: `worker`, `topic`, `status`
   - **Alert thresholds**: P95 latency exceeds threshold, success rate drops below 99%

### Infrastructure Metrics

1. **Service Metrics**:
   - CPU usage per service
   - Memory usage per service
   - Disk usage per service
   - Network usage per service

2. **Kafka Metrics**:
   - Kafka lag for each topic consumer group

3. **Database Metrics**:
   - Database connections count
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

- **Notification API**: REST API endpoint for receiving notification requests from internal services (chat, order, payment, etc.), validates payloads, renders templates, and publishes to Kafka topics (`notification` and `delivery_logs`)

- **Splitter Worker**: Consumes from `notification` topic, checks for message duplication using LRU cache, and routes pre-rendered templates to channel-specific topics (`notification.email` and `notification.push`). Publishes logs to `delivery_logs`.

- **Email Worker**: Consumes from `notification.email` topic, gets list of available providers sorted by priority, calls provider APIs in priority order (failover to next if first fails), handles provider failover (Email Provider 1, 2, 3, ..., X) with circuit breaker, and publishes to `provider_request_response` and `delivery_logs`

- **Push Worker**: Consumes from `notification.push` topic, gets list of available providers sorted by priority, calls provider APIs in priority order (failover to next if first fails), handles provider failover (Push Provider 1, 2, 3, ..., X) with circuit breaker, and publishes to `provider_request_response` and `delivery_logs`

- **DLQ Replay Worker**: Replays messages from Dead Letter Queue topics (`notification.dlq`, `notification.email.dlq`, `notification.push.dlq`) for retry

- **Kafka Connector**: Subscribes to all topics (`delivery_logs`, `provider_request_response`) to build tables from events and persist to database (PostgreSQL or other database depending on use cases)

### Key Technologies

- **NestJS**: Framework for building scalable Node.js applications
- **PostgreSQL**: Database for configuration (templates, events, channels, providers) and event storage via Kafka connector. Database type depends on use cases.
- **Kafka**: Event streaming platform for message processing and event sourcing
- **Circuit Breaker**: Prevents cascading failures when calling external providers
- **LRU Cache**: In-memory caching with concurrent access support for:
  - Configuration data (templates, events, channels, providers) - refreshed periodically
  - Message deduplication (TTL: 2 minutes per notification)
- **Prometheus**: Metrics collection and monitoring via `prom-client` library

### Data Flow Diagram

```
Internal Service (Chat, Payment, etc.)
    ↓
Notification API (Validates Payload, Renders Templates)
    ↓
Kafka Topics:
    - notification (with pre-rendered templates)
    - delivery_logs (notification publishing event)
    ↓
Splitter Worker (Deduplication via LRU Cache & Channel Routing)
    ↓
Kafka Topics:
    - notification.email (individual email messages)
    - notification.push (individual push messages)
    - delivery_logs (routing logs)
    ↓
Email Worker / Push Worker (Provider Failover with Circuit Breaker)
    ↓
External Providers:
    - Email Provider 1, 2, 3, ..., X
    - Push Provider 1, 2, 3, ..., X
    ↓
Kafka Topics:
    - delivery_logs (all stages: routing, provider calls, failures)
    - provider_request_response (detailed provider API interactions)
    ↓
Kafka Connector (Event Sourcing)
    ↓
Database (depends on use cases: PostgreSQL, MongoDB, etc.)
    ↓
Internal Service (consume from delivery_logs for feedback)
```

## Configuration

Configuration is stored in the `migrations/` folder. Database migrations contain the initial configuration for:

- **Templates**: Message templates for each event type and channel
- **Events**: Supported event types (CHAT_MESSAGE, PURCHASE, PAYMENT_REMINDER, SHIPPING_UPDATE)
- **Channels**: Available channels (EMAIL, PUSH) and their mapping to events
- **Providers**: Provider configurations (Email Provider 1-X, Push Provider 1-X) with priority ordering

The system uses runtime configuration stored in database, allowing changes to be made without code deployments.
