import { Module } from '@nestjs/common';
import { NotificationWorkerService } from './notification-worker.service';
import { KafkaModule } from '../../kafka/kafka.module';
import { CacheModule } from '../../cache/cache.module';

@Module({
  imports: [KafkaModule, CacheModule],
  providers: [NotificationWorkerService]
})
export class NotificationWorkerModule {}
