import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NotificationWorkerModule } from './notification-worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(NotificationWorkerModule);
  console.log('Notification Worker started');
}

bootstrap();
