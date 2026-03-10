
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

async function main() {
    const { count, error } = await supabase
        .from('sports_markets')
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error('Error counting markets:', error);
    } else {
        console.log(`Total markets in DB: ${count}`);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
