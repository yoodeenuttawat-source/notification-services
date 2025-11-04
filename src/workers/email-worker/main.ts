import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { EmailWorkerModule } from './email-worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(EmailWorkerModule);
  console.log('Email Worker started');
}

bootstrap();
