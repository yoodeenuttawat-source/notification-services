import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { KafkaService } from '../../kafka/kafka.service';
import { KAFKA_TOPICS } from '../../kafka/kafka.config';
import { DLQMessage } from '../../kafka/types/dlq-message';
import { MetricsService } from '../../metrics/metrics.service';

@Injectable()
export class DLQReplayWorkerService implements OnModuleInit {
  private readonly logger = new Logger(DLQReplayWorkerService.name);
  private readonly ENABLE_AUTO_REPLAY = process.env.DLQ_AUTO_REPLAY === 'true';
  private readonly REPLAY_DELAY = parseInt(process.env.DLQ_REPLAY_DELAY || '5000', 10);
  private readonly workerName = 'dlq-replay-worker';

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly metricsService: MetricsService
  ) {}

  async onModuleInit() {
    if (!this.ENABLE_AUTO_REPLAY) {
      this.logger.log('DLQ auto-replay is disabled. Set DLQ_AUTO_REPLAY=true to enable.');
      return;
    }

    this.logger.log('Initializing DLQ Replay Worker...');

    // Create consumer for all DLQ topics
    const dlqTopics = [
      KAFKA_TOPICS.NOTIFICATION_DLQ,
      KAFKA_TOPICS.PUSH_NOTIFICATION_DLQ,
      KAFKA_TOPICS.EMAIL_NOTIFICATION_DLQ,
    ];

    this.logger.log(
      `Creating consumer for group: dlq-replay-worker-group, topics: ${dlqTopics.join(', ')}`
    );
    const consumer = await this.kafkaService.createConsumer('dlq-replay-worker-group', dlqTopics);

    this.logger.log('Starting to consume messages from DLQ topics...');
    await this.kafkaService.consumeMessages(
      consumer,
      async (payload) => {
        await this.replayDLQMessage(payload);
      },
      undefined,
      'dlq-replay-worker-group'
    );

    this.logger.log('DLQ Replay Worker started and ready to process messages');
  }

  private async replayDLQMessage(payload: any) {
    const startTime = process.hrtime.bigint();
    let status = 'success';
    let dlqTopic = 'unknown';

    try {
      const dlqMessage: DLQMessage = JSON.parse(payload.message.value.toString());
      dlqTopic = payload.topic || dlqMessage.originalTopic || 'unknown';

      const notificationId = dlqMessage.metadata?.notification_id || 'unknown';
      this.logger.log(
        `Replaying message from DLQ: ${notificationId}, ` +
          `original topic: ${dlqMessage.originalTopic}, ` +
          `error: ${dlqMessage.error.message}`
      );

      // Add delay before replay to avoid immediate retry storms
      await new Promise((resolve) => setTimeout(resolve, this.REPLAY_DELAY));

      // Republish original message to original topic
      await this.kafkaService.publishMessage(dlqMessage.originalTopic, [
        {
          key: dlqMessage.originalKey,
          value: dlqMessage.originalMessage,
        },
      ]);

      this.logger.log(
        `Successfully replayed message ${notificationId} ` + `to ${dlqMessage.originalTopic}`
      );

      // Record success metrics
      this.metricsService.dlqReplayTotal.inc({ topic: dlqTopic, status: 'success' });
      status = 'success';
      const duration = Number(process.hrtime.bigint() - startTime) / 1e9;
      this.metricsService.workerProcessingMetrics.observe(
        { worker: this.workerName, topic: dlqTopic, status },
        duration
      );
    } catch (error) {
      this.logger.error('Error replaying DLQ message:', error);
      dlqTopic = payload.topic || 'unknown';
      this.metricsService.dlqReplayTotal.inc({ topic: dlqTopic, status: 'failed' });
      status = 'failure';
      const duration = Number(process.hrtime.bigint() - startTime) / 1e9;
      this.metricsService.workerProcessingMetrics.observe(
        { worker: this.workerName, topic: dlqTopic, status },
        duration
      );
      // Don't throw - we don't want DLQ replay failures to crash the worker
      // Failed replays will remain in DLQ for manual review
    }
  }
}
