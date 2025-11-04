import { Kafka, Consumer } from 'kafkajs';
import { getKafkaConfig } from '../src/kafka/kafka.config';
import { KAFKA_TOPICS } from '../src/kafka/kafka.config';
import { DLQMessage } from '../src/kafka/types/dlq-message';

const args = process.argv.slice(2);
const dlqTopic = args[0];
const limit = args[1] ? parseInt(args[1], 10) : undefined;

if (!dlqTopic) {
  console.log('Usage: ts-node scripts/replay-dlq.ts <DLQ_TOPIC> [LIMIT]');
  console.log('\nAvailable DLQ topics:');
  console.log(`  - ${KAFKA_TOPICS.NOTIFICATION_DLQ}`);
  console.log(`  - ${KAFKA_TOPICS.PUSH_NOTIFICATION_DLQ}`);
  console.log(`  - ${KAFKA_TOPICS.EMAIL_NOTIFICATION_DLQ}`);
  console.log('\nExample:');
  console.log('  ts-node scripts/replay-dlq.ts notification.dlq 10');
  process.exit(1);
}

async function replayDLQ() {
  const config = getKafkaConfig();
  const kafka = new Kafka(config);

  const producer = kafka.producer({
    allowAutoTopicCreation: true,
  });

  await producer.connect();
  console.log('Producer connected');

  const consumer = kafka.consumer({
    groupId: `dlq-replay-${Date.now()}`,
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
  });

  await consumer.connect();
  console.log(`Consumer connected to DLQ topic: ${dlqTopic}`);

  await consumer.subscribe({
    topics: [dlqTopic],
    fromBeginning: true,
  });

  let count = 0;
  let replayed = 0;
  let failed = 0;

  console.log(`\nStarting to replay messages from ${dlqTopic}...`);
  if (limit) {
    console.log(`Limit: ${limit} messages`);
  }
  console.log('');

  await consumer.run({
    eachMessage: async (payload) => {
      if (limit && count >= limit) {
        console.log(`\nReached limit of ${limit} messages. Stopping...`);
        await consumer.disconnect();
        await producer.disconnect();
        console.log(`\nSummary:`);
        console.log(`  Processed: ${count}`);
        console.log(`  Replayed: ${replayed}`);
        console.log(`  Failed: ${failed}`);
        process.exit(0);
        return;
      }

      try {
        const dlqMessage: DLQMessage = JSON.parse(
          payload.message.value.toString()
        );

        const notificationId = dlqMessage.metadata?.notification_id || 'unknown';

        console.log(`[${count + 1}] Replaying: ${notificationId}`);
        console.log(`  Original topic: ${dlqMessage.originalTopic}`);
        console.log(`  Error: ${dlqMessage.error.message}`);
        console.log(`  Timestamp: ${dlqMessage.timestamp}`);

        // Republish original message to original topic
        await producer.send({
          topic: dlqMessage.originalTopic,
          messages: [
            {
              key: dlqMessage.originalKey,
              value: JSON.stringify(dlqMessage.originalMessage),
            },
          ],
        });

        console.log(`  ✅ Replayed to ${dlqMessage.originalTopic}\n`);
        replayed++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`  ❌ Failed to replay: ${errorMsg}\n`);
        failed++;
      }

      count++;
    },
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nShutting down...');
    await consumer.disconnect();
    await producer.disconnect();
    console.log(`\nSummary:`);
    console.log(`  Processed: ${count}`);
    console.log(`  Replayed: ${replayed}`);
    console.log(`  Failed: ${failed}`);
    process.exit(0);
  });
}

replayDLQ().catch((error) => {
  console.error('Error replaying DLQ:', error);
  process.exit(1);
});

