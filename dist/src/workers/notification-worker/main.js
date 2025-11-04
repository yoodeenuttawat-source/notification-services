"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const notification_worker_module_1 = require("./notification-worker.module");
async function bootstrap() {
    const app = await core_1.NestFactory.createApplicationContext(notification_worker_module_1.NotificationWorkerModule);
    console.log('Notification Worker started');
}
bootstrap();
//# sourceMappingURL=main.js.map