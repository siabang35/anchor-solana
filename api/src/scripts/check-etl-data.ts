import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function checkETL() {
    const categories = ['crypto', 'economy', 'sports', 'science'];
    
    for (const cat of categories) {
        console.log(`\n--- Category: ${cat} ---`);
        
        let { count: c1 } = await supabase.from('market_signals').select('*', { count: 'exact', head: true }).eq('category', cat).eq('is_active', true);
        let { count: c2 } = await supabase.from('market_data_items').select('*', { count: 'exact', head: true }).eq('category', cat).eq('is_active', true);
        
        console.log(`  Market Signals: ${c1 || 0}`);
        console.log(`  Market Data Items: ${c2 || 0}`);
        
        let { count: c3 } = await supabase.from('competitions').select('*', { count: 'exact', head: true }).eq('sector', cat).in('status', ['active', 'upcoming']);
        console.log(`  Active Competitions: ${c3 || 0}`);
    }
}
checkETL().catch(console.error);
