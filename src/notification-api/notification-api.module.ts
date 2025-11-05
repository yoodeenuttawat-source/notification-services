import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { NotificationApiController } from './notification-api.controller';
import { NotificationApiService } from './notification-api.service';
import { KafkaModule } from '../kafka/kafka.module';
import { CacheModule } from '../cache/cache.module';
import { DatabaseModule } from '../database/database.module';
import { MetricsModule } from '../metrics/metrics.module';
import { MetricsMiddleware } from '../metrics/metrics.middleware';

@Module({
  imports: [KafkaModule, CacheModule, DatabaseModule, MetricsModule],
  controllers: [NotificationApiController],
  providers: [NotificationApiService],
})
export class NotificationApiModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MetricsMiddleware).forRoutes('*');
  }
}
