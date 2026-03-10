
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

console.log('Loading env from:', envPath);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
    console.log('Please ensure apps/api/.env exists and contains these keys.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function fixMfa() {
    const email = '';
    console.log(`\n🔧 Fixing MFA settings for user: ${email}`);
    console.log('==================================================');

    try {
        // 1. Find the user ID from Profiles (instead of auth.admin.listUsers which failed)
        const { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select('id, email')
            .eq('email', email)
            .limit(1);

        if (profileError) {
            throw new Error(`Failed to list profiles: ${profileError.message}`);
        }

        const user = profiles && profiles[0];

        if (!user) {
            console.error(`❌ User ${email} not found in Supabase Profiles.`);
            return;
        }

        console.log(`✅ Found User ID: ${user.id}`);

        // 2. Update the admin_users table
        const { data: updateData, error: updateError } = await supabase
            .from('admin_users')
            .update({
                mfa_required: false,
                mfa_verified: true,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id)
            .select();

        if (updateError) {
            throw new Error(`Failed to update admin_users: ${updateError.message}`);
        }

        if (!updateData || updateData.length === 0) {
            console.warn('⚠️  Update command ran, but no record was returned. Verify if the user exists in public.admin_users.');

            // Attempt to insert if not exists (fail-safe, though user said they already promoted)
            console.log('Attempting to check/insert admin role...');

            // Get super admin role
            const { data: roles } = await supabase.from('admin_roles').select('id').eq('name', 'super_admin').single();
            if (roles) {
                const { error: insertError } = await supabase.from('admin_users').upsert({
                    user_id: user.id,
                    role_id: roles.id,
                    is_active: true,
                    mfa_required: false,
                    mfa_verified: true,
                    notes: 'Fixed via script'
                });
                if (insertError) console.error('Insert fallback failed:', insertError);
                else console.log('✅ Validated/Inserted admin record.');
            }
        } else {
            console.log('✅ Successfully updated admin_users record!');
            console.log('   - mfa_required: false');
            console.log('   - mfa_verified: true');
        }

    } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : error);
    }
}

fixMfa();
