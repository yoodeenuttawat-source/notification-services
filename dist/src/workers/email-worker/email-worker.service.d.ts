import { OnModuleInit } from '@nestjs/common';
import { KafkaService } from '../../kafka/kafka.service';
import { ConfigService } from '../../cache/config.service';
import { ProviderFactoryService } from '../../providers/provider-factory.service';
import { ChannelWorkerBaseService } from '../channel-worker-base.service';
import { CacheService } from '../../cache/cache.service';
export declare class EmailWorkerService extends ChannelWorkerBaseService implements OnModuleInit {
    protected readonly kafkaService: KafkaService;
    protected readonly cacheService: CacheService;
    protected readonly configService: ConfigService;
    protected readonly providerFactory: ProviderFactoryService;
    constructor(kafkaService: KafkaService, cacheService: CacheService, configService: ConfigService, providerFactory: ProviderFactoryService);
    protected getDedupKeyPrefix(): string;
    protected getDefaultChannelName(): string;
    protected getDLQTopic(): string;
    protected getChannelTopic(): string;
    onModuleInit(): Promise<void>;
    private processEmailNotification;
    private validateEmailMessage;
}
