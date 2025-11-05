import { Module } from '@nestjs/common';
import { SplitterWorkerService } from './splitter-worker.service';
import { KafkaModule } from '../../kafka/kafka.module';
import { CacheModule } from '../../cache/cache.module';
import { MetricsModule } from '../../metrics/metrics.module';

@Module({
  imports: [KafkaModule, CacheModule, MetricsModule],
  providers: [SplitterWorkerService],
})
export class SplitterWorkerModule {}
