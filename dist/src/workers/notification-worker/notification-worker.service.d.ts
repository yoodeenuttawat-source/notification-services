import { OnModuleInit } from '@nestjs/common';
import { KafkaService } from '../../kafka/kafka.service';
import { CacheService } from '../../cache/cache.service';
export declare class NotificationWorkerService implements OnModuleInit {
    private readonly kafkaService;
    private readonly cacheService;
    private readonly logger;
    private readonly DEDUP_TTL_SECONDS;
    constructor(kafkaService: KafkaService, cacheService: CacheService);
    onModuleInit(): Promise<void>;
    private processNotification;
    private routeToChannel;
    private getChannelTopic;
    private publishDeliveryLog;
    private sendToDLQ;
    private isDuplicate;
    private markAsProcessed;
}
