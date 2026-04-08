import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log('Updating agents model from Qwen3.5-9B to Qwen2.5-7B-Instruct...');
    const { data, error } = await supabase
        .from('agents')
        .update({ model: 'Qwen/Qwen2.5-7B-Instruct' })
        .eq('model', 'Qwen/Qwen3.5-9B')
        .select('id, name');
    
    if (error) {
        console.error('Error updating agents:', error);
    } else {
        console.log(`Successfully updated ${data?.length || 0} agents.`);
    }
}

run();
