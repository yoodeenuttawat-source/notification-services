import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SplitterWorkerModule } from './splitter-worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(SplitterWorkerModule);
  console.log('Splitter Worker started');
}

bootstrap();

