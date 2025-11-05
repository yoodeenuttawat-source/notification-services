import { Module, Global } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { MetricsModule } from '../metrics/metrics.module';

@Global()
@Module({
  imports: [MetricsModule],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
