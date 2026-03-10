import { Module } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { UsersController, UsersPublicController } from './users.controller.js';
import { EmailModule } from '../email/email.module.js';

@Module({
    imports: [EmailModule],
    controllers: [UsersController, UsersPublicController],
    providers: [UsersService],
    exports: [UsersService],
})
export class UsersModule { }

