import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { getKafkaConfig } from '../kafka/kafka.config';

export interface ConsumedMessage {
  topic: string;
  partition: number;
  key: string | null;
  value: any;
  timestamp: string;
}

export class KafkaTestHelper {
  private kafka: Kafka;
  private consumers: Map<string, Consumer> = new Map();
  private messages: Map<string, ConsumedMessage[]> = new Map();

  constructor() {
    const config = getKafkaConfig();
    this.kafka = new Kafka(config);
  }

  /**
   * Create a consumer for a topic and collect messages
   */
  async createConsumerForTopic(
    topic: string,
    groupId: string = `test-group-${topic}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  ): Promise<void> {
    const consumer = this.kafka.consumer({
      groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });

    await consumer.connect();
    
    // Retry subscription with exponential backoff in case topic doesn't exist yet
    let retries = 5;
    let lastError: Error | null = null;
    while (retries > 0) {
      try {
        await consumer.subscribe({ topic, fromBeginning: false });
        break;
      } catch (error) {
        lastError = error as Error;
        retries--;
        if (retries > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }
    
    if (retries === 0 && lastError) {
      throw new Error(`Failed to subscribe to topic ${topic} after retries: ${lastError.message}`);
    }

    // Initialize messages array for this topic
    if (!this.messages.has(topic)) {
      this.messages.set(topic, []);
    }

    // Start consuming
    await consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        const message: ConsumedMessage = {
          topic: payload.topic,
          partition: payload.partition,
          key: payload.message.key?.toString() || null,
          value: payload.message.value
            ? JSON.parse(payload.message.value.toString())
            : null,
          timestamp: payload.message.timestamp || '',
        };

        const topicMessages = this.messages.get(topic) || [];
        topicMessages.push(message);
        this.messages.set(topic, topicMessages);
      },
    });

    this.consumers.set(groupId, consumer);
  }

  /**
   * Wait for a message on a topic with timeout
   */
  async waitForMessage(
    topic: string,
    timeout: number = 10000,
    predicate?: (message: ConsumedMessage) => boolean
  ): Promise<ConsumedMessage | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const messages = this.messages.get(topic) || [];
      
      if (messages.length > 0) {
        if (predicate) {
          const matching = messages.find(predicate);
          if (matching) {
            return matching;
          }
        } else {
          return messages[messages.length - 1];
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return null;
  }

  /**
   * Get all messages for a topic
   */
  getMessages(topic: string): ConsumedMessage[] {
    return this.messages.get(topic) || [];
  }

  /**
   * Clear messages for a topic
   */
  clearMessages(topic: string): void {
    this.messages.set(topic, []);
  }

  /**
   * Clear all messages
   */
  clearAllMessages(): void {
    this.messages.clear();
  }

  /**
   * Disconnect all consumers
   */
  async disconnectAll(): Promise<void> {
    for (const consumer of this.consumers.values()) {
      await consumer.disconnect();
    }
    this.consumers.clear();
  }

  /**
   * Get Kafka instance
   */
  getKafka(): Kafka {
    return this.kafka;
  }
}

