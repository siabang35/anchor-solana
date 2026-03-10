import { createClient } from '@supabase/supabase-js';
const supabase = createClient('http://localhost:8000', 'dummy');
const channel = supabase.channel('dummy') as any;
console.log(typeof channel.httpSend);
