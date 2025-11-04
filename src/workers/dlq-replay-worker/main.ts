import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DLQReplayWorkerModule } from './dlq-replay-worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(DLQReplayWorkerModule);
  console.log('DLQ Replay Worker started');
}

bootstrap();
