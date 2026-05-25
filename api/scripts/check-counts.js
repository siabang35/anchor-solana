const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log('Listing all agents in the agents table:');
    const { data: agents, error } = await supabase
        .from('agents')
        .select('id, name, status, competition_id');
    
    if (error) {
        console.error('Error fetching agents:', error);
    } else {
        console.log(agents);
    }
    process.exit(0);
}

check();




