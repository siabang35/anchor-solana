import { Module } from '@nestjs/common';
import { PoolController } from './pool.controller.js';
import { PoolService } from './pool.service.js';
import { ClaimRateLimitGuard } from './guards/claim-rate-limit.guard.js';

@Module({
    controllers: [PoolController],
    providers: [PoolService, ClaimRateLimitGuard],
    exports: [PoolService],
})
export class PoolModule {}
