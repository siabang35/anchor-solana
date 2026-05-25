const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const compId = 'df34b2b8-92c1-4781-b43a-f2f06572fcd2';
    const { data: pool } = await supabase
        .from('competition_pools')
        .select('*, competitions(*)')
        .eq('competition_id', compId);
    console.log(JSON.stringify(pool, null, 2));

    const { data: stakes } = await supabase
        .from('pool_stakes')
        .select('*, agents(name, user_id)')
        .eq('competition_id', compId);
    console.log('Stakes:', JSON.stringify(stakes, null, 2));

    process.exit(0);
}

check();
