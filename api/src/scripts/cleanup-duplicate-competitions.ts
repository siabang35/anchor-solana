import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { SupabaseService } from '../database/supabase.service.js';
import { tokenize } from '../common/utils/clustering.util.js';

const SIMILARITY_THRESHOLD = 0.40;

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
    const app = await NestFactory.createApplicationContext(AppModule);
    const supabaseService = app.get(SupabaseService);
    const supabase = supabaseService.getAdminClient();

    console.log('Fetching active & upcoming competitions...');
    
    const { data: competitions, error } = await supabase
        .from('competitions')
        .select('id, title, sector, time_horizon, created_at')
        .in('status', ['active', 'upcoming'])
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching:', error);
        await app.close();
        return;
    }

    const seenTitles = new Set<string>();
    const seenHorizons = new Set<string>();
    const duplicateIds: string[] = [];

    for (const comp of competitions) {
        const normalizedTitle = normalizeTitle(comp.title || '');
        const horizonKey = `${comp.sector}::${comp.time_horizon}`;

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
                    
                    if (sim > SIMILARITY_THRESHOLD) {
                        isDuplicate = true;
                        console.log(`Duplicate near-match similarity=${sim.toFixed(2)}: "${comp.title}" matches existing`);
                        break;
                    }
                }
            }
        }

        // 2. Check horizon slot
        if (comp.time_horizon && seenHorizons.has(horizonKey)) {
            isDuplicate = true;
            console.log(`Duplicate horizon slot: [${comp.sector}/${comp.time_horizon}] title="${comp.title}"`);
        }

        if (isDuplicate) {
            duplicateIds.push(comp.id);
        } else {
            seenTitles.add(normalizedTitle);
            if (comp.time_horizon) {
                seenHorizons.add(horizonKey);
            }
        }
    }

    console.log(`Found ${duplicateIds.length} duplicate competitions to cancel.`);

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
    }

    await app.close();
}

cleanupDuplicates().catch(err => {
    console.error(err);
    process.exit(1);
});
