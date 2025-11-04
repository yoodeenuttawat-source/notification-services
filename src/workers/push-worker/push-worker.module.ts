import { Module } from '@nestjs/common';
import { PushWorkerService } from './push-worker.service';
import { KafkaModule } from '../../kafka/kafka.module';
import { CacheModule } from '../../cache/cache.module';
import { ProvidersModule } from '../../providers/providers.module';

@Module({
  imports: [KafkaModule, CacheModule, ProvidersModule],
  providers: [PushWorkerService]
})
export class PushWorkerModule {}
