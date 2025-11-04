import { Module } from '@nestjs/common';
import { NotificationWorkerService } from './notification-worker.service';
import { KafkaModule } from '../../kafka/kafka.module';

@Module({
  imports: [KafkaModule],
  providers: [NotificationWorkerService]
})
export class NotificationWorkerModule {}
