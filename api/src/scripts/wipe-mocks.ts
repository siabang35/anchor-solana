import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function wipeMockData() {
    console.log('Fetching existing competitions...');
    const { data: comps, error: fetchErr } = await supabase.from('competitions').select('id, title, metadata');
    if (fetchErr) {
        console.error('Failed to fetch competitions:', fetchErr);
        return;
    }

    console.log(`Found ${comps.length} total competitions.`);
    
    // Attempt deleting everything to force a clean slate from real cluster data
    console.log('Wiping all competitions to clean up old mockups...');
    const { error: delErr } = await supabase.from('competitions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (delErr) {
        console.error('Failed to wipe competitions:', delErr);
    } else {
        console.log('Successfully wiped all mockup competitions.');
    }
}

wipeMockData().catch(console.error);
