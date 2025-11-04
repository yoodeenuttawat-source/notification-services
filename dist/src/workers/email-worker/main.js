"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const email_worker_module_1 = require("./email-worker.module");
async function bootstrap() {
    const app = await core_1.NestFactory.createApplicationContext(email_worker_module_1.EmailWorkerModule);
    console.log('Email Worker started');
}
bootstrap();
//# sourceMappingURL=main.js.map