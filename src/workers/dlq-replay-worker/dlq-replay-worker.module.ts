import { Module } from '@nestjs/common';
import { DLQReplayWorkerService } from './dlq-replay-worker.service';
import { KafkaModule } from '../../kafka/kafka.module';
import { MetricsModule } from '../../metrics/metrics.module';

@Module({
  imports: [KafkaModule, MetricsModule],
  providers: [DLQReplayWorkerService],
})
export class DLQReplayWorkerModule {}
