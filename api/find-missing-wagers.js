const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/home/wii-ros/Documents/Project/solana/my-project/api/.env' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function find() {
    const { data: agents } = await supabase.from('agents').select('id, name, user_id, created_at').order('created_at', { ascending: false }).limit(5);
    console.log("Recent Agents:");
    for (const a of agents) {
        const { data: wagers } = await supabase.from('agent_wagers').select('*').eq('agent_id', a.id);
        const { data: entries } = await supabase.from('agent_competition_entries').select('competition_id').eq('agent_id', a.id);
        console.log(`- ${a.name} (ID: ${a.id}) | Wagers: ${wagers?.length} | Comps: ${entries?.length}`);
        if (wagers?.length === 0 && entries?.length > 0) {
            console.log(`  => MISSING WAGER! Let's insert 0.5 SOL for competition ${entries[0].competition_id}`);
            // Insert wager
            await supabase.from('agent_wagers').insert({
                agent_id: a.id,
                user_id: a.user_id,
                competition_id: entries[0].competition_id,
                wager_amount: 0.5,
                refund_rate: 0.5,
                status: 'active'
            });
            // Get Pool
            const { data: pool } = await supabase.from('competition_pools').select('id').eq('competition_id', entries[0].competition_id).single();
            if (pool) {
                await supabase.from('pool_stakes').insert({
                    pool_id: pool.id,
                    competition_id: entries[0].competition_id,
                    user_id: a.user_id,
                    agent_id: a.id,
                    stake_amount: 0.5,
                    onchain_tx: 'dummy_0.5_tx'
                });
                console.log(`  => Fixed pool stake for 0.5 SOL!`);
            }
        }
    }
}
find();
