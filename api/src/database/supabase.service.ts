import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase Service
 * Provides authenticated Supabase clients for database operations
 */
@Injectable()
export class SupabaseService implements OnModuleInit {
    private readonly logger = new Logger(SupabaseService.name);

    private client: SupabaseClient;
    private adminClient: SupabaseClient;

    constructor(private readonly configService: ConfigService) { }

    async onModuleInit() {
        const supabaseUrl = this.configService.get<string>('SUPABASE_URL')!;
        const supabaseAnonKey = this.configService.get<string>('SUPABASE_ANON_KEY')!;
        const supabaseServiceKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!;

        // Public client (respects RLS)
        this.client = createClient(supabaseUrl, supabaseAnonKey, {
            auth: {
                autoRefreshToken: true,
                persistSession: false,
                detectSessionInUrl: false,
            },
        });

        // Admin client (bypasses RLS - use carefully!)
        this.adminClient = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });

        // Test connection
        try {
            const { error } = await this.adminClient.from('profiles').select('count').limit(0);
            if (error && !error.message.includes('does not exist')) {
                this.logger.warn(`Supabase connection test: ${error.message}`);
            } else {
                this.logger.log('✅ Supabase connection established');
            }
        } catch (err) {
            this.logger.warn('Supabase connection test failed (table may not exist yet)');
        }
    }

    /**
     * Get the public Supabase client
     * Respects Row Level Security policies
     */
    getClient(): SupabaseClient {
        return this.client;
    }

    /**
     * Get the admin Supabase client
     * Bypasses RLS - use only for admin operations
     */
    getAdminClient(): SupabaseClient {
        return this.adminClient;
    }

    /**
     * Get a client authenticated as a specific user
     * Used for operations that need to respect RLS for a specific user
     */
    async getClientAsUser(accessToken: string): Promise<SupabaseClient> {
        const supabaseUrl = this.configService.get<string>('SUPABASE_URL')!;
        const supabaseAnonKey = this.configService.get<string>('SUPABASE_ANON_KEY')!;

        return createClient(supabaseUrl, supabaseAnonKey, {
            global: {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            },
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });
    }
}
