"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const push_worker_module_1 = require("./push-worker.module");
async function bootstrap() {
    const app = await core_1.NestFactory.createApplicationContext(push_worker_module_1.PushWorkerModule);
    console.log('Push Worker started');
}
bootstrap();
//# sourceMappingURL=main.js.map