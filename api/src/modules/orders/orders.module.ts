import { Module, forwardRef } from '@nestjs/common';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { MarketsModule } from '../markets/markets.module.js';

@Module({
    imports: [forwardRef(() => MarketsModule)],
    controllers: [OrdersController],
    providers: [OrdersService],
    exports: [OrdersService],
})
export class OrdersModule { }
