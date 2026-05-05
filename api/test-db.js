const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function check() {
  const { count, error } = await supabase.from('market_data_items').select('*', { count: 'exact', head: true }).eq('category', 'economy');
  console.log(`Economy records count: ${count}`);
}
check();
