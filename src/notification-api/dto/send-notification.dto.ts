import { IsString, IsNotEmpty, IsObject, IsOptional } from 'class-validator';

export class SendNotificationDto {
  @IsString()
  @IsNotEmpty()
  notification_id: string;

  @IsString()
  @IsNotEmpty()
  event_type: string;

  @IsObject()
  @IsNotEmpty()
  data: Record<string, any>;

  @IsObject()
  @IsOptional()
  metadata?: {
    source?: string;
    user_id?: string;
    [key: string]: any;
  };
}
