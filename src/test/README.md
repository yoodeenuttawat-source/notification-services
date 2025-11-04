# Integration Tests Guide

This guide explains how to set up and run integration tests for the notification services.

## Prerequisites

- Node.js (v18 or higher)
- Docker and Docker Compose
- npm or yarn

## Quick Start (After Cloning)

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Infrastructure Services

Start PostgreSQL, Kafka, and Zookeeper using Docker Compose:

```bash
docker-compose -f docker-compose-infra.yml up -d
```

This will:
- Start PostgreSQL on port `5432` with database `notification_db`
- Start Zookeeper on port `2181`
- Start Kafka on port `29092`
- Automatically run database migrations from the `migrations/` folder

**Note:** The first time you run this, it may take a minute for all services to be ready. You can check the status with:

```bash
docker-compose -f docker-compose-infra.yml ps
```

### 3. Verify Database Setup

The migrations run automatically when the PostgreSQL container starts. To verify, you can check the database:

```bash
# Optional: Connect to PostgreSQL to verify
docker exec -it notif_postgres psql -U postgres -d notification_db -c "SELECT * FROM event_types;"
```

You should see 4 event types: `CHAT_MESSAGE`, `PURCHASE`, `PAYMENT_REMINDER`, `SHIPPING_UPDATE`.

### 4. Start Workers (Required for Tests)

**CRITICAL:** Integration tests require all three workers to be running. Start them in separate terminals:

#### Terminal 1: Notification Worker
```bash
npm run start:notification-worker
```
This worker routes messages from the `notification` topic to `notification.push` and `notification.email` topics.

#### Terminal 2: Push Worker
```bash
npm run start:push-worker
```
This worker processes push notifications and publishes delivery logs.

#### Terminal 3: Email Worker
```bash
npm run start:email-worker
```
This worker processes email notifications and publishes delivery logs.

**Expected Output:** You should see logs indicating:
- Consumer created for group
- Workers are ready and listening for messages

### 5. Run Integration Tests

Once all workers are running, execute the integration tests:

```bash
npm run test:integration
```

## Test Commands

### Run Integration Tests Only
```bash
npm run test:integration
```

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Tests with Coverage
```bash
npm run test:cov
```

## What the Tests Verify

The integration tests (`notification-api.integration.spec.ts`) verify the complete notification flow:

### 1. API Endpoint Tests
- ✅ POST `/notifications/send` endpoint accepts requests
- ✅ Returns correct response format
- ✅ Validates request payload structure

### 2. Kafka Message Publishing
- ✅ Messages published to `notification` topic
- ✅ Messages routed to `notification.push` topic (for PUSH channel)
- ✅ Messages routed to `notification.email` topic (for EMAIL channel)
- ✅ Message keys are set to `notification_id`

### 3. Template Rendering
- ✅ Templates are correctly rendered with variable substitution
- ✅ Correct templates selected based on event type and channel
- ✅ Exact values verified for:
  - `recipient` (user_id for PUSH, user_email for EMAIL)
  - `template_content` (rendered HTML/text)
  - `template_subject` (for EMAIL channel)

### 4. Delivery Logs
- ✅ Routing logs published (stage: `routed`, status: `pending`)
- ✅ Success logs published (stage: `provider_success`, status: `success`)
- ✅ Logs include: `notification_id`, `event_name`, `channel_name`, `provider_request_id`, `message_id`

### 5. Provider Request/Response
- ✅ Provider request/response messages published to `provider_request_response` topic
- ✅ Request structure matches what providers send
- ✅ Response structure matches provider responses
- ✅ Headers include correct provider information
- ✅ Timestamps are valid (response_timestamp >= request_timestamp)

### 6. Event Types Tested
- ✅ `CHAT_MESSAGE` - supports both PUSH and EMAIL
- ✅ `PURCHASE` - supports both PUSH and EMAIL
- ✅ `PAYMENT_REMINDER` - supports only PUSH
- ✅ `SHIPPING_UPDATE` - supports only PUSH

## Environment Variables

Tests use the following environment variables (with defaults):

| Variable | Default | Description |
|----------|---------|-------------|
| `KAFKA_BROKERS` | `localhost:29092` | Kafka broker addresses |
| `DB_HOST` | `localhost` | Database host |
| `DB_PORT` | `5432` | Database port |
| `DB_NAME` | `notification_db` | Database name |
| `DB_USER` | `postgres` | Database user |
| `DB_PASSWORD` | `postgres` | Database password |
| `API_PORT` | `3000` | API server port |

You can override these by creating a `.env` file (copy from `.env.example`) or setting them in your environment.

## Troubleshooting

### Tests Fail with "Connection refused" or "ECONNREFUSED"

**Problem:** Kafka or PostgreSQL is not running.

**Solution:**
```bash
# Check if containers are running
docker-compose -f docker-compose-infra.yml ps

# Start containers if not running
docker-compose -f docker-compose-infra.yml up -d

# Check logs if containers are crashing
docker-compose -f docker-compose-infra.yml logs
```

### Tests Timeout Waiting for Messages

**Problem:** Workers are not running or not processing messages.

**Solution:**
1. Verify all three workers are running (check terminal outputs)
2. Check for error messages in worker logs
3. Ensure workers show "Consumer created for group" messages
4. Verify Kafka is accessible: `docker-compose -f docker-compose-infra.yml logs kafka`

### Tests Fail with "No providers found"

**Problem:** Database seed data is missing or migrations didn't run.

**Solution:**
```bash
# Stop and restart containers to trigger migrations
docker-compose -f docker-compose-infra.yml down
docker-compose -f docker-compose-infra.yml up -d

# Or manually run migrations
npm run migrate
npm run seed
```

### Tests Fail with "Topic not found" or "Leader not available"

**Problem:** Kafka topics haven't been created yet.

**Solution:**
- Topics are created automatically when workers start
- Ensure workers have started successfully before running tests
- Wait a few seconds after starting workers for topics to be created

### Workers Not Starting

**Problem:** Dependencies or configuration issues.

**Solution:**
1. Verify dependencies are installed: `npm install`
2. Check Node.js version: `node --version` (should be v18+)
3. Check for TypeScript errors: `npm run build`
4. Verify environment variables are set correctly

## Test Structure

```
src/notification-api/
  └── notification-api.integration.spec.ts  # Main integration test file

src/test/
  └── kafka-test-helper.ts                   # Kafka test utilities
```

## Cleanup

To stop all services:

```bash
# Stop Docker containers
docker-compose -f docker-compose-infra.yml down

# Stop workers (Ctrl+C in each terminal)
```

## Additional Notes

- Each test creates unique consumer groups to avoid conflicts
- Tests wait up to 20 seconds for messages to arrive (Kafka async nature)
- Messages are cleared between tests
- Tests verify **exact data values**, not just types
- Provider request/response messages include JSON-stringified request/response bodies
- `provider_request_id` is set to `notification_id` for joining delivery logs with provider responses

## Next Steps

After running integration tests successfully:
- Review test output for any warnings
- Check test coverage: `npm run test:cov`
- Explore individual test cases in `notification-api.integration.spec.ts`
- Modify test data to test different scenarios
