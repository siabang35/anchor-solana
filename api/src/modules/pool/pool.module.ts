import { Module } from '@nestjs/common';
import { PoolController } from './pool.controller.js';
import { PoolService } from './pool.service.js';

@Module({
    controllers: [PoolController],
    providers: [PoolService],
    exports: [PoolService],
})
export class PoolModule {}
