import { OnModuleInit } from '@nestjs/common';
import { KafkaService } from '../../kafka/kafka.service';
import { ConfigService } from '../../cache/config.service';
import { ProviderFactoryService } from '../../providers/provider-factory.service';
import { CacheService } from '../../cache/cache.service';
export declare class EmailWorkerService implements OnModuleInit {
    private readonly kafkaService;
    private readonly configService;
    private readonly providerFactory;
    private readonly cacheService;
    private readonly logger;
    private readonly DEDUP_TTL_SECONDS;
    constructor(kafkaService: KafkaService, configService: ConfigService, providerFactory: ProviderFactoryService, cacheService: CacheService);
    onModuleInit(): Promise<void>;
    private processEmailNotification;
    private parseMessage;
    private validateEmailMessage;
    private getProviders;
    private handleNoProviders;
    private trySendNotification;
    private handleAllProvidersFailed;
    private handleProcessingError;
    private publishDeliveryLog;
    private sendToDLQ;
    private isDuplicate;
    private markAsProcessed;
}
