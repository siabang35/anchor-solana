const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/home/wii-ros/Documents/Project/solana/my-project/api/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fix() {
    const agent_id = '001c4b05-854b-4a17-8864-e5a9469a1d38';
    const comp_id = '08c24130-a67a-4d4c-af91-4084d33af491';
    const user_id = '78f005e9-c504-42b5-8ada-2a0c9f441bd7';
    
    console.log("Fetching pool...");
    const { data: pool, error: pErr } = await supabase.from('competition_pools').select('id').eq('competition_id', comp_id).single();
    if (pErr || !pool) {
        console.error("Pool not found", pErr);
        // Create pool
        const { data: newPool } = await supabase.from('competition_pools').insert({ competition_id: comp_id }).select('id').single();
        pool_id = newPool.id;
    } else {
        pool_id = pool.id;
    }
    console.log("Pool ID:", pool_id);

    console.log("Inserting wager...");
    const { error: wErr } = await supabase.from('agent_wagers').insert({
        agent_id: agent_id,
        user_id: user_id,
        competition_id: comp_id,
        wager_amount: 0.2,
        refund_rate: 0.5,
        status: 'active'
    });
    if (wErr) console.log("Wager error:", wErr.message);

    console.log("Inserting pool stake...");
    const { error: sErr } = await supabase.from('pool_stakes').insert({
        pool_id: pool_id,
        competition_id: comp_id,
        user_id: user_id,
        agent_id: agent_id,
        stake_amount: 0.2,
        onchain_tx: '5yV6b1vS...' // dummy
    });
    if (sErr) console.log("Stake error:", sErr.message);

    console.log("Done");
}
fix();
