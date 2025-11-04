"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var KafkaService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.KafkaService = void 0;
const common_1 = require("@nestjs/common");
const kafkajs_1 = require("kafkajs");
const kafka_config_1 = require("./kafka.config");
let KafkaService = KafkaService_1 = class KafkaService {
    constructor() {
        this.logger = new common_1.Logger(KafkaService_1.name);
        this.consumers = new Map();
        const config = (0, kafka_config_1.getKafkaConfig)();
        this.kafka = new kafkajs_1.Kafka(config);
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
        for (const consumer of this.consumers.values()) {
            await consumer.disconnect();
        }
        await this.producer.disconnect();
        this.logger.log('Kafka producer disconnected');
    }
    async publishMessage(topic, messages) {
        try {
            await this.producer.send({
                topic,
                messages: messages.map((msg) => ({
                    key: msg.key,
                    value: JSON.stringify(msg.value)
                }))
            });
            this.logger.debug(`Published ${messages.length} message(s) to topic: ${topic}`);
        }
        catch (error) {
            this.logger.error(`Failed to publish message to topic ${topic}:`, error);
            throw error;
        }
    }
    async createConsumer(groupId, topics) {
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
    async consumeMessages(consumer, handler) {
        await consumer.run({
            eachMessage: async (payload) => {
                try {
                    await handler(payload);
                }
                catch (error) {
                    this.logger.error('Error processing message:', error);
                }
            }
        });
    }
    getProducer() {
        return this.producer;
    }
};
exports.KafkaService = KafkaService;
exports.KafkaService = KafkaService = KafkaService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], KafkaService);
//# sourceMappingURL=kafka.service.js.map