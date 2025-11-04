# Notification Services

A notification service built with NestJS, PostgreSQL, and Kafka that handles multi-channel notifications (PUSH and EMAIL) with provider failover, circuit breakers, and dead letter queues.

## Features

- **Multi-channel Support**: PUSH and EMAIL notifications
- **Event-based Routing**: Supports CHAT_MESSAGE, PURCHASE, PAYMENT_REMINDER, SHIPPING_UPDATE
- **Provider Failover**: Automatic failover between multiple providers per channel
- **Circuit Breaker**: Prevents cascading failures
- **Dead Letter Queue (DLQ)**: Handles failed messages with retry capability
- **Template Rendering**: Dynamic template rendering with variable substitution
- **Message Deduplication**: Prevents duplicate processing
- **Comprehensive Logging**: Delivery logs and provider request/response tracking

## Architecture

```
API → Kafka (notification) → Notification Worker → Kafka (notification.push/email)
                                                    ↓
                                         Push/Email Workers → Providers
                                                    ↓
                                         Delivery Logs + Provider Responses
```

## Quick Start

### Prerequisites

- Node.js (v18 or higher)
- Docker and Docker Compose
- npm or yarn

### 1. Clone and Install

```bash
git clone <repository-url>
cd notification-services
npm install
```

### 2. Start Infrastructure

```bash
docker-compose -f docker-compose-infra.yml up -d
```

This starts:
- PostgreSQL (port 5432)
- Zookeeper (port 2181)
- Kafka (port 29092)

Migrations run automatically when PostgreSQL starts.

### 3. Start Services

#### Option A: Start All Services
```bash
npm run start:all
```

#### Option B: Start Individually
```bash
# Terminal 1: API
npm run start:api

# Terminal 2: Splitter Worker
npm run start:splitter-worker

# Terminal 3: Push Worker
npm run start:push-worker

# Terminal 4: Email Worker
npm run start:email-worker
```

### 4. Test the API

The API runs on port 3000 by default (configurable via `API_PORT` environment variable).

**Health Check:**
```bash
curl http://localhost:3000/health
```

**Send a notification:**
```bash
npm run call-api
```

Or send a POST request to `http://localhost:3000/notifications/send`:

```json
{
  "notification_id": "test-123",
  "event_type": "CHAT_MESSAGE",
  "data": {
    "sender_name": "John Doe",
    "message_preview": "Hello!",
    "user_id": "user123",
    "user_name": "Jane Doe",
    "user_email": "jane@example.com"
  }
}
```

## Running Tests

### Unit Tests

Unit tests are located in `src/` and test individual components in isolation:

```bash
# Run unit tests
npm run test:unit

# Or simply
npm test
```

### E2E Tests

E2E tests are located in `e2e/` and test the full integration flow including Kafka, workers, and database.

For detailed e2e test setup and troubleshooting, see [src/test/README.md](src/test/README.md).

**Quick Start:**
1. Start infrastructure: `docker-compose -f docker-compose-infra.yml up -d`
2. Start all workers (in separate terminals):
   - `npm run start:splitter-worker`
   - `npm run start:push-worker`
   - `npm run start:email-worker`
3. Run e2e tests: `npm run test:e2e`

### All Tests

```bash
# Run all tests (unit + e2e)
npm run test:all

# Run with coverage (unit tests only)
npm run test:cov

# Run in watch mode (unit tests only)
npm run test:watch
```

## Project Structure

```
notification-services/
├── src/                            # Source code
│   ├── notification-api/          # REST API endpoint
│   ├── workers/                    # Kafka workers
│   │   ├── splitter-worker/   # Routes messages to channels
│   │   ├── push-worker/            # Processes push notifications
│   │   ├── email-worker/           # Processes email notifications
│   │   └── dlq-replay-worker/      # Replays DLQ messages
│   ├── providers/                  # Notification providers
│   │   ├── base-provider.service.ts
│   │   ├── push/                   # Push providers
│   │   └── email/                 # Email providers
│   ├── kafka/                      # Kafka configuration and types
│   ├── cache/                      # In-memory cache service
│   ├── circuit-breaker/            # Circuit breaker implementation
│   └── test/                       # Test utilities
│   └── **/*.spec.ts                # Unit tests
├── e2e/                            # End-to-end tests
│   └── notification-api/
│       └── *.e2e.spec.ts           # E2E integration tests
├── migrations/                     # Database migrations
├── scripts/                        # Utility scripts
├── jest.config.js                 # Jest config for unit tests
├── jest.e2e.config.js              # Jest config for e2e tests
└── docker-compose-infra.yml        # Infrastructure services
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run start:api` | Start API server |
| `npm run start:splitter-worker` | Start splitter worker |
| `npm run start:push-worker` | Start push worker |
| `npm run start:email-worker` | Start email worker |
| `npm run start:all` | Start API and all workers |
| `npm run test` | Run unit tests (default) |
| `npm run test:unit` | Run unit tests explicitly |
| `npm run test:e2e` | Run e2e integration tests |
| `npm run test:all` | Run both unit and e2e tests |
| `npm run test:cov` | Run unit tests with coverage |
| `npm run test:watch` | Run unit tests in watch mode |
| `npm run migrate` | Run database migrations |
| `npm run call-api` | Send test notification to API |
| `npm run replay-dlq` | Replay messages from DLQ |

## Environment Variables

### Root `.env` File (Recommended)

Copy `.env.example` to `.env` in the root directory and update values as needed:

```bash
cp .env.example .env
```

This will be used by all services by default.

### Service-Specific `.env` Files (Optional)

For service-specific configurations, you can create `.env` files in each service directory:

- `src/notification-api/.env` - API-specific configuration
- `src/workers/splitter-worker/.env` - Splitter worker configuration
- `src/workers/push-worker/.env` - Push worker configuration
- `src/workers/email-worker/.env` - Email worker configuration
- `src/workers/dlq-replay-worker/.env` - DLQ replay worker configuration

**Note:** NestJS by default loads `.env` from the root directory. To use service-specific `.env` files, you can:
1. Use `dotenv-cli`: `npm install -g dotenv-cli` then `dotenv -e src/notification-api/.env -- npm run start:api`
2. Use a tool like `cross-env` to set variables
3. Or use the root `.env` file (recommended for simplicity)

The service-specific `.env` files are already created with appropriate defaults for each service.

| Variable | Default | Description |
|----------|---------|-------------|
| **Database** |||
| `DB_HOST` | `localhost` | Database host |
| `DB_PORT` | `5432` | Database port |
| `DB_NAME` | `notification_db` | Database name |
| `DB_USER` | `postgres` | Database user |
| `DB_PASSWORD` | `postgres` | Database password |
| `DB_SSL` | `false` | Enable SSL for database connection |
| `DB_MAX_CONNECTIONS` | `20` | Maximum database connection pool size |
| **Kafka** |||
| `KAFKA_BROKERS` | `localhost:29092` | Kafka broker addresses (comma-separated) |
| `KAFKA_CLIENT_ID` | `notification-service` | Kafka client identifier |
| `KAFKA_GROUP_ID` | `notification-service-group` | Kafka consumer group ID |
| `KAFKA_RETRIES` | `8` | Number of Kafka retry attempts |
| `KAFKA_INITIAL_RETRY_TIME` | `100` | Initial retry delay in milliseconds |
| **API** |||
| `API_PORT` | `3000` | Port for the notification API server |
| `API_URL` | `http://localhost:3000` | Base URL for API (used by scripts) |
| **Cache** |||
| `CACHE_MAX_SIZE` | `10000` | Maximum cache entries (LRU eviction) |
| **Email Providers** |||
| `EMAIL_FROM` | `noreply@example.com` | Default email sender address |
| `EMAIL_PROVIDER1_API_URL` | `https://api.email-provider1.com/v1/send` | Email provider 1 API endpoint |
| `EMAIL_PROVIDER2_API_URL` | `https://api.email-provider2.com/v1/send` | Email provider 2 API endpoint |
| **Push Providers** |||
| `PUSH_PROVIDER1_API_URL` | `https://api.push-provider1.com/v1/push` | Push provider 1 API endpoint |
| `PUSH_PROVIDER2_API_URL` | `https://api.push-provider2.com/v1/notifications` | Push provider 2 API endpoint |
| **Provider API (Shared)** |||
| `PROVIDER_API_KEY` | (empty) | API key for provider authentication |
| `PROVIDER_API_URL` | (varies) | Fallback provider API URL if provider-specific URL not set |
| **Dead Letter Queue** |||
| `DLQ_AUTO_REPLAY` | `false` | Enable automatic DLQ replay |
| `DLQ_REPLAY_DELAY` | `5000` | Delay in milliseconds between DLQ replay attempts |

## Supported Events and Channels

| Event Type | PUSH | EMAIL |
|------------|------|-------|
| CHAT_MESSAGE | ✅ | ✅ |
| PURCHASE | ✅ | ✅ |
| PAYMENT_REMINDER | ✅ | ❌ |
| SHIPPING_UPDATE | ✅ | ❌ |

## Kafka Topics

- `notification` - Main notification topic (from API)
- `notification.push` - Push notification topic
- `notification.email` - Email notification topic
- `delivery_logs` - Delivery tracking logs
- `provider_request_response` - Provider request/response tracking
- `notification.dlq` - Dead letter queue for notification topic
- `notification.push.dlq` - Dead letter queue for push topic
- `notification.email.dlq` - Dead letter queue for email topic

## Documentation

- [Integration Tests Guide](src/test/README.md) - Detailed setup and troubleshooting for integration tests
- [Scripts README](scripts/README.md) - Utility scripts documentation

## License

[Add your license here]
