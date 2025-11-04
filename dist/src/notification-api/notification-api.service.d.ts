import { KafkaService } from '../kafka/kafka.service';
import { ConfigService } from '../cache/config.service';
import { DatabaseService } from '../database/database.service';
import { SendNotificationDto } from './dto/send-notification.dto';
export declare class NotificationApiService {
    private readonly kafkaService;
    private readonly configService;
    private readonly databaseService;
    private readonly logger;
    constructor(kafkaService: KafkaService, configService: ConfigService, databaseService: DatabaseService);
    sendNotification(dto: SendNotificationDto): Promise<void>;
    private substituteVariables;
    private getRecipient;
}
