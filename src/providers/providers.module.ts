import { Module } from '@nestjs/common';
import { ProviderFactoryService } from './provider-factory.service';
import { CircuitBreakerService } from '../circuit-breaker/CircuitBreakerService';
import { MetricsModule } from '../metrics/metrics.module';
import { KafkaModule } from '../kafka/kafka.module';

@Module({
  imports: [MetricsModule, KafkaModule],
  providers: [CircuitBreakerService, ProviderFactoryService],
  exports: [ProviderFactoryService, CircuitBreakerService],
})
export class ProvidersModule {}
