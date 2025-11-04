import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NotificationApiModule } from './notification-api.module';

async function bootstrap() {
  const app = await NestFactory.create(NotificationApiModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  const port = process.env.API_PORT || 3000;
  await app.listen(port);
  console.log(`Notification API is running on: http://localhost:${port}`);
}

bootstrap();
