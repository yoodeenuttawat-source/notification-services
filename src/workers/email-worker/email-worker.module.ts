import { Module } from '@nestjs/common';
import { EmailWorkerService } from './email-worker.service';
import { KafkaModule } from '../../kafka/kafka.module';
import { CacheModule } from '../../cache/cache.module';
import { ProvidersModule } from '../../providers/providers.module';

@Module({
  imports: [KafkaModule, CacheModule, ProvidersModule],
  providers: [EmailWorkerService],
})
export class EmailWorkerModule {}
