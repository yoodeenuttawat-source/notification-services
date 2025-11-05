import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Kafka, Producer, Consumer, EachMessagePayload, Partitioners } from 'kafkajs';
import { getKafkaConfig } from './kafka.config';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private kafka: Kafka;
  private producer: Producer;
  private consumers: Map<string, Consumer> = new Map();

  constructor(private readonly metricsService: MetricsService) {
    const config = getKafkaConfig();
    this.kafka = new Kafka(config);
    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000,
      createPartitioner: Partitioners.LegacyPartitioner,
    });
  }

  async onModuleInit() {
    await this.producer.connect();
    this.logger.log('Kafka producer connected');
  }

  async onModuleDestroy() {
    // Disconnect all consumers
    for (const consumer of this.consumers.values()) {
      await consumer.disconnect();
    }

    await this.producer.disconnect();
    this.logger.log('Kafka producer disconnected');
  }

  /**
   * Publish message to a topic
   */
  async publishMessage<T>(
    topic: string,
    messages: Array<{ key?: string; value: T }>
  ): Promise<void> {
    const timer = this.metricsService.kafkaPublishMetrics.startTimer({ topic });
    
    try {
      await this.producer.send({
        topic,
        messages: messages.map((msg) => ({
          key: msg.key,
          value: JSON.stringify(msg.value),
        })),
      });
      
      this.logger.debug(`Published ${messages.length} message(s) to topic: ${topic}`);
      timer({ status: 'success' });
    } catch (error) {
      this.logger.error(`Failed to publish message to topic ${topic}:`, error);
      timer({ status: 'failed' });
      throw error;
    }
  }

  /**
   * Create and start a consumer
   */
  async createConsumer(groupId: string, topics: string[]): Promise<Consumer> {
    const consumer = this.kafka.consumer({
      groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });

    await consumer.connect();
    await consumer.subscribe({ topics, fromBeginning: false });

    this.consumers.set(groupId, consumer);
    this.logger.log(`Consumer created for group: ${groupId}, topics: ${topics.join(', ')}`);

    return consumer;
  }

  /**
   * Start consuming messages
   */
  async consumeMessages(
    consumer: Consumer,
    handler: (payload: EachMessagePayload) => Promise<void>,
    topic?: string,
    consumerGroup?: string
  ): Promise<void> {
    await consumer.run({
      eachMessage: async (payload) => {
        const timer = this.metricsService.kafkaConsumeMetrics.startTimer({
          topic: topic || payload.topic,
          consumer_group: consumerGroup || 'unknown',
        });
        
        try {
          await handler(payload);
          timer();
        } catch (error) {
          this.logger.error('Error processing message:', error);
          timer();
          // You might want to handle errors differently (DLQ, retry, etc.)
        }
      },
    });
  }

  /**
   * Get producer instance
   */
  getProducer(): Producer {
    return this.producer;
  }
}
