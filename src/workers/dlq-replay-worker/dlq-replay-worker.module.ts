import { Module } from '@nestjs/common';
import { DLQReplayWorkerService } from './dlq-replay-worker.service';
import { KafkaModule } from '../../kafka/kafka.module';

@Module({
  imports: [KafkaModule],
  providers: [DLQReplayWorkerService],
})
export class DLQReplayWorkerModule {}

