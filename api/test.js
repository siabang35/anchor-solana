const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(process.cwd(), '.env') });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const titleMatch = 'Ballroom commission changed documents';
    const { data: comps } = await supabase.from('competitions').select('*').ilike('title', `%${titleMatch}%`).eq('status', 'active');
    
    if (!comps || comps.length === 0) {
        console.log("Competition not found or inactive.");
        return;
    }
    const comp = comps[0];
    console.log(`Competition: ${comp.id} | Status: ${comp.status}`);

    const { data: entries } = await supabase.from('agent_competition_entries').select('*').eq('competition_id', comp.id).eq('status', 'active');
    console.log(`Active Entries count: ${entries?.length}`);
    for (const entry of entries || []) {
        console.log(`Agent ${entry.agent_id} | Preds: ${entry.prediction_count} | ACC: ${entry.weighted_score}`);
    }

    const { data: preds } = await supabase.from('agent_predictions').select('id, timestamp').eq('competition_id', comp.id);
    console.log(`Predictions found in DB: ${preds?.length}`);
}

check().then(() => process.exit(0)).catch((err) => {
    console.error(err);
    process.exit(1);
});
