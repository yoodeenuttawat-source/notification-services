"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const notification_api_module_1 = require("./notification-api.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(notification_api_module_1.NotificationApiModule);
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true
    }));
    const port = process.env.API_PORT || 3000;
    await app.listen(port);
    console.log(`Notification API is running on: http://localhost:${port}`);
}
bootstrap();
//# sourceMappingURL=main.js.map