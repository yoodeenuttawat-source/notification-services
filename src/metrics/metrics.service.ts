import { Injectable } from '@nestjs/common';
import * as client from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly register: client.Registry;

  // Notification API Metrics
  public readonly notificationApiRequestMetrics: client.Histogram<string>;

  // Worker Metrics
  public readonly workerProcessingMetrics: client.Histogram<string>;

  // DLQ Metrics
  public readonly dlqReplayTotal: client.Counter<string>;

  // Provider API Metrics
  public readonly providerApiMetrics: client.Histogram<string>;

  // Circuit Breaker Metrics
  public readonly circuitBreakerState: client.Gauge<string>;

  // Kafka Metrics
  public readonly kafkaPublishMetrics: client.Histogram<string>;
  public readonly kafkaConsumeMetrics: client.Histogram<string>;

  // Database Metrics
  public readonly databaseQueryMetrics: client.Histogram<string>;

  constructor() {
    this.register = new client.Registry();
    client.collectDefaultMetrics({ register: this.register });

    // Notification API Metrics
    this.notificationApiRequestMetrics = new client.Histogram({
      name: 'notification_api_request_duration_seconds',
      help: 'Metrics for notification API requests (duration, count)',
      labelNames: ['method', 'url', 'httpStatus'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
      registers: [this.register],
    });

    // Worker Metrics
    this.workerProcessingMetrics = new client.Histogram({
      name: 'worker_processing_duration_seconds',
      help: 'Metrics for worker message processing (duration, count)',
      labelNames: ['worker', 'topic', 'status'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
      registers: [this.register],
    });

    // DLQ Metrics
    this.dlqReplayTotal = new client.Counter({
      name: 'dlq_replay_total',
      help: 'Total number of DLQ messages replayed',
      labelNames: ['topic', 'status'],
      registers: [this.register],
    });

    // Provider API Metrics
    this.providerApiMetrics = new client.Histogram({
      name: 'provider_api_duration_seconds',
      help: 'Metrics for provider API calls (duration, count)',
      labelNames: ['provider', 'channel', 'status'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
      registers: [this.register],
    });

    // Circuit Breaker Metrics
    this.circuitBreakerState = new client.Gauge({
      name: 'circuit_breaker_state',
      help: 'Circuit breaker state (0=CLOSED, 1=OPEN, 2=HALF_OPEN)',
      labelNames: ['provider'],
      registers: [this.register],
    });

    // Kafka Metrics
    this.kafkaPublishMetrics = new client.Histogram({
      name: 'kafka_publish_duration_seconds',
      help: 'Metrics for Kafka publish operations (duration, count)',
      labelNames: ['topic', 'status'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
      registers: [this.register],
    });

    this.kafkaConsumeMetrics = new client.Histogram({
      name: 'kafka_consume_duration_seconds',
      help: 'Metrics for Kafka message consumption (duration, count)',
      labelNames: ['topic', 'consumer_group'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
      registers: [this.register],
    });

    // Database Metrics
    this.databaseQueryMetrics = new client.Histogram({
      name: 'database_query_duration_seconds',
      help: 'Metrics for database queries (duration, count)',
      labelNames: ['operation', 'status'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [this.register],
    });
  }

  /**
   * Get metrics registry
   */
  getRegister(): client.Registry {
    return this.register;
  }

  /**
   * Get metrics as string (Prometheus format)
   */
  async getMetrics(): Promise<string> {
    return this.register.metrics();
  }
}

