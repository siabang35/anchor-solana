import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
import { UsersModule } from '../users/users.module.js';

@Module({
    imports: [UsersModule],
    controllers: [DashboardController],
    providers: [DashboardService],
})
export class DashboardModule { }
