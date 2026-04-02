import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
    let { count } = await supabase.from('agent_predictions').select('*', { count: 'exact', head: true });
    console.log(`Total agent predictions: ${count}`);
    
    let { data: agents } = await supabase.from('agents').select('id, name, status');
    console.log("Agents:");
    console.log(JSON.stringify(agents, null, 2));
}
check().catch(console.error);
