import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
    let { data, error } = await supabase.from('trending_topics').select('topic, categories, primary_category').limit(10);
    console.log(JSON.stringify(data, null, 2));
}
check().catch(console.error);
