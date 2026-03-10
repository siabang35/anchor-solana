import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { SecurityGateway } from './security.gateway.js';
import { AdminGuard, SuperAdminGuard } from './guards/index.js';
import { DatabaseModule } from '../../database/database.module.js';

@Module({
    imports: [
        DatabaseModule,
        JwtModule.register({}), // We just need the service for verification
    ],
    controllers: [AdminController],
    providers: [
        AdminService,
        SecurityGateway,
        AdminGuard,
        SuperAdminGuard,
    ],
    exports: [AdminService, AdminGuard, SuperAdminGuard, SecurityGateway],
    exports: [AdminService, AdminGuard, SuperAdminGuard],
})
export class AdminModule { }
