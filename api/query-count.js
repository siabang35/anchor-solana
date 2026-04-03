const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
    const { count, error } = await supabase.from('agent_predictions').select('*', { count: 'exact', head: true });
    console.log("Total agent predictions in DB:", count, error);
}
run();
