# Integration Tests

## Setup

Before running integration tests, ensure:

1. **Docker services are running:**
   ```bash
   docker-compose -f docker-compose-infra.yml up -d
   ```

2. **Database migrations and seed data:**
   ```bash
   # The migrations will run automatically when postgres container starts
   # Or manually run:
   npm run migrate
   npm run seed
   ```

3. **Workers must be running:**
   ```bash
   # The tests require the notification worker to route messages
   npm run start:notification-worker
   
   # The tests also require push and email workers for successful delivery logs
   npm run start:push-worker
   npm run start:email-worker
   ```
   
   **IMPORTANT:** All workers must be running in separate terminals/processes
   for the integration tests to pass. The tests verify:
   - Notification worker routes messages to PUSH and EMAIL topics
   - Push worker processes messages and publishes success logs
   - Email worker processes messages and publishes success logs

4. **Install dependencies:**
   ```bash
   npm install
   ```

## Running Tests

### Run all tests:
```bash
npm test
```

### Run integration tests only:
```bash
npm run test:integration
```

### Run tests in watch mode:
```bash
npm run test:watch
```

### Run tests with coverage:
```bash
npm run test:cov
```

## Test Structure

The integration tests verify:

1. **API Endpoint Tests** (`notification-api.integration.spec.ts`):
   - POST /notifications/send endpoint
   - Message publishing to Kafka `notification` topic
   - Message structure and content validation
   - Template rendering for different event types
   - Channel routing (PUSH/EMAIL) based on event type

2. **Kafka Topic Verification**:
   - Messages published to `notification` topic
   - Messages routed to `notification.push` and `notification.email` topics
   - Message key is set to `notification_id`
   - Rendered templates contain correct channel information
   - Exact values for recipient, template_content, and template_subject

3. **Delivery Logs Verification**:
   - Delivery logs published to `delivery_logs` topic
   - Routing logs (stage: 'routed', status: 'pending') when messages are routed to channels
   - Success logs (stage: 'provider_success', status: 'success') when messages are successfully sent
   - Success logs include provider_name and message_id
   - Logs include notification_id, event_name, channel_name, event_id, channel_id, and timestamp

## Environment Variables

Tests use the following environment variables (with defaults):
- `KAFKA_BROKERS`: Kafka broker addresses (default: `localhost:29092`)
- `DB_HOST`: Database host (default: `localhost`)
- `DB_PORT`: Database port (default: `5432`)
- `DB_NAME`: Database name (default: `notification_db`)
- `DB_USER`: Database user (default: `postgres`)
- `DB_PASSWORD`: Database password (default: `postgres`)

## Notes

- Tests require Kafka and PostgreSQL to be running
- **CRITICAL:** All workers must be running for all tests to pass
  - Notification worker: routes messages to push/email topics and creates routing logs
  - Push worker: processes push messages and creates success logs
  - Email worker: processes email messages and creates success logs
  - Start workers with: 
    - `npm run start:notification-worker`
    - `npm run start:push-worker`
    - `npm run start:email-worker`
- Each test creates unique consumer groups to avoid conflicts
- Tests wait up to 15 seconds for messages to arrive
- Messages are cleared between tests
- Tests verify exact data values (not just type checking) for:
  - Recipients (user_id for PUSH, user_email for EMAIL)
  - Template content (with variable substitution)
  - Template subject (for EMAIL)
  - Delivery log fields (stage, status, event_id, channel_id, timestamp)

