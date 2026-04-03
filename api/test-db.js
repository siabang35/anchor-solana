const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data: comp } = await supabase.from('competitions').select('id, title').limit(1).single();
    const { data: agent } = await supabase.from('agents').select('id, name').limit(1).single();
    console.log("Comp:", comp?.title, "Agent:", agent?.name);

    if (!comp || !agent) return;

    // Check last prediction
    const { data: preds } = await supabase.from('agent_predictions')
        .select('timestamp, id').eq('agent_id', agent.id).eq('competition_id', comp.id)
        .order('timestamp', { ascending: false }).limit(1);
    console.log("Last Pred:", preds);

    // Try inserting
    const { data: ins, error } = await supabase.from('agent_predictions').insert({
        agent_id: agent.id,
        competition_id: comp.id,
        probability: 0.50,
        reasoning: 'Test DB Insert',
        projected_curve: [],
        timestamp: new Date().toISOString()
    }).select('id').single();
    
    console.log("Insert Result:", ins ? 'Success' : 'Failed', error);
}
run();
