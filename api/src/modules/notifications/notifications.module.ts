import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { DatabaseModule } from '../../database/database.module.js';

@Module({
    imports: [DatabaseModule],
    controllers: [NotificationsController],
    providers: [NotificationsService],
    exports: [NotificationsService],
})
export class NotificationsModule { }
