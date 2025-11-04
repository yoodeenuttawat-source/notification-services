import { OnModuleInit } from '@nestjs/common';
import { KafkaService } from '../../kafka/kafka.service';
export declare class NotificationWorkerService implements OnModuleInit {
    private readonly kafkaService;
    private readonly logger;
    constructor(kafkaService: KafkaService);
    onModuleInit(): Promise<void>;
    private processNotification;
    private routeToChannel;
    private getChannelTopic;
    private publishDeliveryLog;
}
