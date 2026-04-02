import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

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
        .replace(/\$[\d,.]+/g, '')      // Remove price values like $32.93
        .replace(/[\d,.]+%/g, '')        // Remove percentages
        .replace(/\d{1,2}h\s*change/gi, '') // Remove "24h Change" patterns
        .replace(/[^\w\s]/g, '')
        .trim()
        .toLowerCase();
}

async function cleanupDuplicates() {
    console.log('Fetching active & upcoming competitions to clean fuzzy duplicates...');
    
    const { data: competitions, error } = await supabase
        .from('competitions')
        .select('id, title, sector, time_horizon, created_at')
        .in('status', ['active', 'upcoming'])
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching competitions:', error);
        return;
    }

    const seenTitles = new Set<string>();
    const duplicateIds: string[] = [];

    for (const comp of competitions) {
        const normalizedTitle = normalizeTitle(comp.title || '');
        let isDuplicate = false;

        // 1. Check title similarity
        if (seenTitles.has(normalizedTitle)) {
            isDuplicate = true;
            console.log(`Duplicate exact title: "${comp.title}"`);
        } else {
            const candidateTokens = new Set(tokenize(normalizedTitle));
            if (candidateTokens.size > 0) {
                for (const existing of seenTitles) {
                    const existingTokens = new Set(tokenize(existing));
                    let intersection = 0;
                    for (const t of candidateTokens) {
                        if (existingTokens.has(t)) intersection++;
                    }
                    const union = candidateTokens.size + existingTokens.size - intersection;
                    const sim = union > 0 ? intersection / union : 0;
                    
                    if (sim > 0.40) { // SIMILARITY_THRESHOLD
                        isDuplicate = true;
                        console.log(`Duplicate near-match similarity=${sim.toFixed(2)}: "${comp.title}" matches existing`);
                        break;
                    }
                }
            }
        }

        if (isDuplicate) {
            duplicateIds.push(comp.id);
        } else {
            seenTitles.add(normalizedTitle);
        }
    }

    console.log(`Found ${duplicateIds.length} fuzzy duplicate competitions to cancel.`);

    if (duplicateIds.length > 0) {
        const { error: updateError } = await supabase
            .from('competitions')
            .update({ status: 'cancelled' })
            .in('id', duplicateIds);

        if (updateError) {
            console.error('Failed to cancel duplicates:', updateError);
        } else {
            console.log(`Successfully cancelled ${duplicateIds.length} duplicate competitions.`);
        }
    } else {
        console.log('No duplicates found.');
    }
}

cleanupDuplicates().catch(console.error);
