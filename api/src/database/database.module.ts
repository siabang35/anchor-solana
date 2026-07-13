import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseService } from './supabase.service.js';
import { R2Service } from './r2.service.js';

@Global()
@Module({
    imports: [ConfigModule],
    providers: [SupabaseService, R2Service],
    exports: [SupabaseService, R2Service],
})
export class DatabaseModule { }
