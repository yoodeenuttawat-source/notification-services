import { Module, Global } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CacheService } from './cache.service';
import { ConfigService } from './config.service';
import { DatabaseModule } from '../database/database.module';
import { DatabaseService } from '../database/database.service';

@Global()
@Module({
  imports: [ScheduleModule.forRoot(), DatabaseModule],
  providers: [
    // Single CacheService instance for all use cases
    {
      provide: CacheService,
      useFactory: () => {
        return new CacheService({
          maxSize: parseInt(process.env.CACHE_MAX_SIZE || '10000', 10),
          cacheName: 'CacheService',
        });
      },
    },
    // ConfigService - use factory to inject dependencies
    {
      provide: ConfigService,
      useFactory: (databaseService: DatabaseService, cacheService: CacheService) => {
        return new ConfigService(databaseService, cacheService);
      },
      inject: [DatabaseService, CacheService],
    },
  ],
  // Even though @Global() makes providers available, we need to export factory providers
  exports: [CacheService, ConfigService],
})
export class CacheModule {}
