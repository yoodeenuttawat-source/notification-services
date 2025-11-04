import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { PushWorkerModule } from './push-worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(PushWorkerModule);
  console.log('Push Worker started');
}

bootstrap();
