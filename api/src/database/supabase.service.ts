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

        // Run automatic migrations for wallet connect tables
        const databaseUrl = this.configService.get<string>('DATABASE_URL');
        if (databaseUrl) {
            try {
                const pgModule = await import('pg');
                const pg = pgModule.default || pgModule;
                const cleanedUrl = databaseUrl.replace(/^"(.*)"$/, '$1').replace('#', '%23').replace('$', '%24');
                const client = new pg.Client({
                    connectionString: cleanedUrl,
                    ssl: {
                        rejectUnauthorized: false
                    }
                });
                await client.connect();
                
                // Check if wallet_auth_nonces exists
                const tableCheck = await client.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = 'wallet_auth_nonces'
                    );
                `);
                
                const tableExists = tableCheck.rows[0]?.exists;
                const fs = await import('fs');
                const path = await import('path');

                if (!tableExists) {
                    this.logger.log('Table wallet_auth_nonces not found. Running wallet connect migrations...');
                    
                    const migrationFiles = [
                        '025_wallet_connect_auth.sql',
                        '026_quick_wallet_setup.sql'
                    ];

                    for (const file of migrationFiles) {
                        const sqlPath = path.join(process.cwd(), 'supabase/migrations', file);
                        if (fs.existsSync(sqlPath)) {
                            this.logger.log(`Running migration file: ${file}`);
                            const sql = fs.readFileSync(sqlPath, 'utf8');
                            await client.query(sql);
                            this.logger.log(`✅ Migration ${file} applied successfully!`);
                        } else {
                            this.logger.warn(`Migration file not found at ${sqlPath}`);
                        }
                    }
                } else {
                    this.logger.log('Wallet connect database tables are up-to-date.');
                }

                // Always run the case sensitivity fix to ensure functions are correct and up-to-date
                const fixMigration = 'full_sql/012_fix_solana_address.sql';
                const sqlPath = path.join(process.cwd(), 'supabase', fixMigration);
                if (fs.existsSync(sqlPath)) {
                    this.logger.log(`Applying case sensitivity fix: ${fixMigration}`);
                    const sql = fs.readFileSync(sqlPath, 'utf8');
                    await client.query(sql);
                    this.logger.log(`✅ Case sensitivity fix applied successfully!`);
                }

                // Always reload PostgREST schema cache on startup to ensure API layer is in sync
                this.logger.log('Reloading Supabase schema cache...');
                await client.query("NOTIFY pgrst, 'reload' || ' schema';");
                this.logger.log('✅ Supabase schema cache reloaded successfully!');

                await client.end();
            } catch (err) {
                this.logger.error(`Failed to run automatic migrations: ${err.message}`, err.stack);
            }
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
