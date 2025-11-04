import { Module } from '@nestjs/common';
import { SplitterWorkerService } from './splitter-worker.service';
import { KafkaModule } from '../../kafka/kafka.module';
import { CacheModule } from '../../cache/cache.module';

@Module({
  imports: [KafkaModule, CacheModule],
  providers: [SplitterWorkerService],
})
export class SplitterWorkerModule {}
