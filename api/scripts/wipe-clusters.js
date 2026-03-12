const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log('Wiping existing auto-generated AI Cluster competitions...');
    
    // Delete all auto-generated ones
    const { data, error } = await supabase
        .from('competitions')
        .delete()
        .contains('tags', ['ai-cluster']);
        
    if (error) {
        console.error('Error deleting old competitions:', error);
        process.exit(1);
    }
    
    console.log('Successfully wiped old competitions. Freeing slots for Qwen NLP generation.');
    process.exit(0);
}

check();
