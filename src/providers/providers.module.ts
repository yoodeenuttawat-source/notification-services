import { Module } from '@nestjs/common';
import { ProviderFactoryService } from './provider-factory.service';
import { CircuitBreakerService } from '../circuit-breaker/CircuitBreakerService';

@Module({
  providers: [CircuitBreakerService, ProviderFactoryService],
  exports: [ProviderFactoryService, CircuitBreakerService],
})
export class ProvidersModule {}
