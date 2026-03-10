/**
 * seed-admin.ts
 * 
 * Creates a Super Admin user using Supabase Admin API.
 * This is the recommended way to create admin users as it properly
 * handles password hashing through Supabase's internal mechanisms.
 * 
 * Usage:
 *   npx ts-node scripts/seed-admin.ts
 *   
 * Or with environment variables:
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=securepass npx ts-node scripts/seed-admin.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Admin credentials - can be overridden via environment variables
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@exoduze.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_FULL_NAME = process.env.ADMIN_FULL_NAME || 'System Administrator';

async function seedAdmin() {
    console.log('🔐 ExoDuZe Admin Seeder');
    console.log('='.repeat(50));

    // Validate environment
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        console.error('Missing required environment variables:');
        console.error('   - SUPABASE_URL');
        console.error('   - SUPABASE_SERVICE_ROLE_KEY');
        console.error('\nPlease check your .env file.');
        process.exit(1);
    }

    // Create Supabase admin client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });

    console.log(`\n📧 Creating admin user: ${ADMIN_EMAIL}`);

    try {
        // Step 1: Check if user already exists
        const { data: existingUsers } = await supabase
            .from('profiles')
            .select('id, email')
            .eq('email', ADMIN_EMAIL)
            .limit(1);

        if (existingUsers && existingUsers.length > 0) {
            console.log('⚠️  User already exists. Promoting to admin...');

            // Just promote to admin
            const { data: result, error: promoteError } = await supabase
                .rpc('promote_to_super_admin', { p_email: ADMIN_EMAIL });

            if (promoteError) {
                console.error('❌ Failed to promote user:', promoteError.message);
                process.exit(1);
            }

            console.log('✅', result);
            console.log('\n🎉 Admin setup complete!');
            console.log('='.repeat(50));
            console.log(`📧 Email: ${ADMIN_EMAIL}`);
            console.log('🔑 Password: (your existing password)');
            return;
        }

        // Step 2: Create new user via Supabase Admin API
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD,
            email_confirm: true, // Auto-confirm email
            user_metadata: {
                full_name: ADMIN_FULL_NAME,
            },
        });

        if (authError) {
            console.error('❌ Failed to create auth user:', authError.message);
            process.exit(1);
        }

        console.log('✅ Auth user created:', authData.user.id);

        // Step 3: Create profile
        const { error: profileError } = await supabase
            .from('profiles')
            .insert({
                id: authData.user.id,
                email: ADMIN_EMAIL,
                full_name: ADMIN_FULL_NAME,
            });

        if (profileError) {
            console.error('⚠️  Profile creation warning:', profileError.message);
            // Don't exit - profile might be auto-created by trigger
        } else {
            console.log('✅ Profile created');
        }

        // Step 4: Promote to Super Admin
        const { data: promoteResult, error: promoteError } = await supabase
            .rpc('promote_to_super_admin', { p_email: ADMIN_EMAIL });

        if (promoteError) {
            console.error('❌ Failed to promote to admin:', promoteError.message);
            console.log('\nYou can manually promote the user by running:');
            console.log(`   SELECT public.promote_to_super_admin('${ADMIN_EMAIL}');`);
            process.exit(1);
        }

        console.log('✅', promoteResult);

        // Success!
        console.log('\n🎉 Admin user created successfully!');
        console.log('='.repeat(50));
        console.log(`Email: ${ADMIN_EMAIL}`);
        console.log(`Password: ${ADMIN_PASSWORD}`);
        console.log('\nIMPORTANT: Change this password after first login!');
        console.log('='.repeat(50));

    } catch (error) {
        console.error('Unexpected error:', error);
        process.exit(1);
    }
}

// Run the seeder
seedAdmin().catch(console.error);
