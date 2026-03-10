import { Module } from '@nestjs/common';
import { ReferralsController } from './referrals.controller.js';
import { ReferralsService } from './referrals.service.js';
import { DatabaseModule } from '../../database/database.module.js';

@Module({
    imports: [DatabaseModule],
    controllers: [ReferralsController],
    providers: [ReferralsService],
    exports: [ReferralsService],
})
export class ReferralsModule { }
