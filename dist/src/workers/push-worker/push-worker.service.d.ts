import { OnModuleInit } from '@nestjs/common';
import { KafkaService } from '../../kafka/kafka.service';
import { ConfigService } from '../../cache/config.service';
import { ProviderFactoryService } from '../../providers/provider-factory.service';
export declare class PushWorkerService implements OnModuleInit {
    private readonly kafkaService;
    private readonly configService;
    private readonly providerFactory;
    private readonly logger;
    constructor(kafkaService: KafkaService, configService: ConfigService, providerFactory: ProviderFactoryService);
    onModuleInit(): Promise<void>;
    private processPushNotification;
    private publishDeliveryLog;
}
