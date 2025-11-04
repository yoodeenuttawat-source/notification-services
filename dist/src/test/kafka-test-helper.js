"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KafkaTestHelper = void 0;
const kafkajs_1 = require("kafkajs");
const kafka_config_1 = require("../kafka/kafka.config");
class KafkaTestHelper {
    constructor() {
        this.consumers = new Map();
        this.messages = new Map();
        const config = (0, kafka_config_1.getKafkaConfig)();
        this.kafka = new kafkajs_1.Kafka(config);
    }
    async createConsumerForTopic(topic, groupId = `test-group-${topic}-${Date.now()}-${Math.random().toString(36).substring(7)}`) {
        const consumer = this.kafka.consumer({
            groupId,
            sessionTimeout: 30000,
            heartbeatInterval: 3000,
        });
        await consumer.connect();
        let retries = 5;
        let lastError = null;
        while (retries > 0) {
            try {
                await consumer.subscribe({ topic, fromBeginning: false });
                break;
            }
            catch (error) {
                lastError = error;
                retries--;
                if (retries > 0) {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
            }
        }
        if (retries === 0 && lastError) {
            throw new Error(`Failed to subscribe to topic ${topic} after retries: ${lastError.message}`);
        }
        if (!this.messages.has(topic)) {
            this.messages.set(topic, []);
        }
        await consumer.run({
            eachMessage: async (payload) => {
                const message = {
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
    async waitForMessage(topic, timeout = 10000, predicate) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const messages = this.messages.get(topic) || [];
            if (messages.length > 0) {
                if (predicate) {
                    const matching = messages.find(predicate);
                    if (matching) {
                        return matching;
                    }
                }
                else {
                    return messages[messages.length - 1];
                }
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return null;
    }
    getMessages(topic) {
        return this.messages.get(topic) || [];
    }
    clearMessages(topic) {
        this.messages.set(topic, []);
    }
    clearAllMessages() {
        this.messages.clear();
    }
    async disconnectAll() {
        for (const consumer of this.consumers.values()) {
            await consumer.disconnect();
        }
        this.consumers.clear();
    }
    getKafka() {
        return this.kafka;
    }
}
exports.KafkaTestHelper = KafkaTestHelper;
//# sourceMappingURL=kafka-test-helper.js.map