
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

async function cleanup() {
    console.log('Starting cleanup of simulated markets...');

    // 1. Delete markets with 'Simulated' in description
    // Using admin client (service role) to ensure we can delete
    const { data, error, count } = await supabase
        .from('sports_markets')
        .delete({ count: 'exact' })
        .eq('description', 'Full Time Result (Simulated)')
        .select();

    if (error) {
        console.error('Error deleting simulated markets:', error);
    } else {
        console.log(`Deleted ${data?.length || 0} markets with 'Full Time Result (Simulated)' description.`);
    }

    // Double check specific titles if needed
    // const { count: count2 } = await supabase.from('sports_markets').delete({ count: 'exact' }).ilike('title', '%Simulated%');
    // console.log(`Deleted ${count2} markets with Title containing "Simulated".`);
}

cleanup().catch(err => {
    console.error(err);
    process.exit(1);
});
