import { Kafka } from 'kafkajs';
export interface ConsumedMessage {
    topic: string;
    partition: number;
    key: string | null;
    value: any;
    timestamp: string;
}
export declare class KafkaTestHelper {
    private kafka;
    private consumers;
    private messages;
    constructor();
    createConsumerForTopic(topic: string, groupId?: string): Promise<void>;
    waitForMessage(topic: string, timeout?: number, predicate?: (message: ConsumedMessage) => boolean): Promise<ConsumedMessage | null>;
    getMessages(topic: string): ConsumedMessage[];
    clearMessages(topic: string): void;
    clearAllMessages(): void;
    disconnectAll(): Promise<void>;
    getKafka(): Kafka;
}
