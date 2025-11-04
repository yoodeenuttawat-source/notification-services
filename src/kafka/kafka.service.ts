import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';
import { getKafkaConfig } from './kafka.config';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private kafka: Kafka;
  private producer: Producer;
  private consumers: Map<string, Consumer> = new Map();

  constructor() {
    const config = getKafkaConfig();
    this.kafka = new Kafka(config);
    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000
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
  async publishMessage<T>(topic: string, messages: Array<{ key?: string; value: T }>): Promise<void> {
    try {
      await this.producer.send({
        topic,
        messages: messages.map((msg) => ({
          key: msg.key,
          value: JSON.stringify(msg.value)
        }))
      });
      this.logger.debug(`Published ${messages.length} message(s) to topic: ${topic}`);
    } catch (error) {
      this.logger.error(`Failed to publish message to topic ${topic}:`, error);
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
      heartbeatInterval: 3000
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
    handler: (payload: EachMessagePayload) => Promise<void>
  ): Promise<void> {
    await consumer.run({
      eachMessage: async (payload) => {
        try {
          await handler(payload);
        } catch (error) {
          this.logger.error('Error processing message:', error);
          // You might want to handle errors differently (DLQ, retry, etc.)
        }
      }
    });
  }

  /**
   * Get producer instance
   */
  getProducer(): Producer {
    return this.producer;
  }
}
