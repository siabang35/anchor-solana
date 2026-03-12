import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log('Checking competitions count per sector...');
    const { data, error } = await supabase
        .from('competitions')
        .select('sector, status')
        .eq('status', 'active');
        
    if (error) {
        console.error('Error fetching competitions:', error);
        return;
    }
    
    const counts = data.reduce((acc, curr) => {
        acc[curr.sector] = (acc[curr.sector] || 0) + 1;
        return acc;
    }, {});
    
    console.log('Active Competitions per Sector:');
    console.log(counts);
}

check();
