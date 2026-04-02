import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function tokenize(text: string): string[] {
    const STOP_WORDS = new Set(['the', 'is', 'in', 'at', 'of', 'and', 'a', 'to', 'for', 'on', 'with', 'as', 'by', 'an', 'this', 'that']);
    return text.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(word => word.length > 2 && !STOP_WORDS.has(word));
}

function normalizeTitle(title: string): string {
    return title
        .replace(/\s+/g, ' ')
        .replace(/[—–\-]+/g, ' ')
        .replace(/outcome prediction\??/gi, '')
        .replace(/\$[\d,.]+/g, '')
        .replace(/[\d,.]+%/g, '')
        .replace(/\d{1,2}h\s*change/gi, '')
        .replace(/[^\w\s]/g, '')
        .trim()
        .toLowerCase();
}

async function debugDuplicates() {
    console.log('Fetching ALL active/upcoming comps...');
    const { data: competitions, error } = await supabase
        .from('competitions')
        .select('id, title, sector, status')
        .in('status', ['active', 'upcoming']);

    if (error) {
        console.error(error);
        return;
    }

    console.log(`Fetched ${competitions?.length} active/upcoming comps.`);

    const seenTitles = new Set<string>();
    for (const comp of competitions || []) {
        console.log(`\n- [${comp.sector}] [${comp.status}] ${comp.title}`);
        const norm = normalizeTitle(comp.title);
        console.log(`  Norm: "${norm}" | Tokens: [${tokenize(norm).join(', ')}]`);
        
        let isDuplicate = false;
        if (seenTitles.has(norm)) isDuplicate = true;
        else {
            const cTokens = new Set(tokenize(norm));
            for (const existing of seenTitles) {
                const eTokens = new Set(tokenize(existing));
                let inter = 0;
                for (const t of cTokens) {
                    if (eTokens.has(t)) inter++;
                }
                const sim = (cTokens.size + eTokens.size - inter) > 0 ? inter / (cTokens.size + eTokens.size - inter) : 0;
                if (sim > 0.40) {
                    isDuplicate = true;
                    console.log(`  >> DUPLICATE OF: "${existing}" (sim=${sim})`);
                }
            }
        }
        seenTitles.add(norm);
        
        if (isDuplicate) {
            console.log(`  >> CANCELLING ID: ${comp.id}`);
            await supabase.from('competitions').update({ status: 'cancelled' }).eq('id', comp.id);
        }
    }
}

debugDuplicates().catch(console.error);
