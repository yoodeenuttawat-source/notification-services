import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Producer, Consumer, EachMessagePayload } from 'kafkajs';
export declare class KafkaService implements OnModuleInit, OnModuleDestroy {
    private readonly logger;
    private kafka;
    private producer;
    private consumers;
    constructor();
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    publishMessage<T>(topic: string, messages: Array<{
        key?: string;
        value: T;
    }>): Promise<void>;
    createConsumer(groupId: string, topics: string[]): Promise<Consumer>;
    consumeMessages(consumer: Consumer, handler: (payload: EachMessagePayload) => Promise<void>): Promise<void>;
    getProducer(): Producer;
}
