import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CacheService } from './cache.service';
import { ConfigService } from './config.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [ScheduleModule.forRoot(), DatabaseModule],
  providers: [CacheService, ConfigService],
  exports: [CacheService, ConfigService]
})
export class CacheModule {}
