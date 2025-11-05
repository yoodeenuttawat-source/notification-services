import { Module, Global } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsMiddleware } from './metrics.middleware';
import { MetricsController } from './metrics.controller';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService, MetricsMiddleware],
  exports: [MetricsService, MetricsMiddleware],
})
export class MetricsModule {}

