import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller.js';
import { TransactionsService } from './transactions.service.js';
import { DatabaseModule } from '../../database/database.module.js';

@Module({
    imports: [DatabaseModule],
    controllers: [TransactionsController],
    providers: [TransactionsService],
    exports: [TransactionsService],
})
export class TransactionsModule { }
