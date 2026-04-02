import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { computeTfIdf, kMeansClustering } from '../common/utils/clustering.util';

dotenv.config({ path: path.join(process.cwd(), '.env') });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const TARGET = 5;

// Mocks the seeder functions
function computeUrgencyFromText(text: string): number {
    const lower = text.toLowerCase();
    let score = 0.5;
    const urgentPatterns = /\b(breaking|urgent|live|tonight|today|speech|address|press|ongoing|immediate|crash|surge|alert|minutes|hours|now|flash)\b/g;
    score += (lower.match(urgentPatterns) || []).length * 0.1;
    return Math.max(0, Math.min(1, score));
}

function cleanTitle(rawTitle: string): string {
    let title = rawTitle.trim();
    if (!title.endsWith('?')) title = `${title} — outcome prediction?`;
    return title;
}

function normalizeForDedup(title: string): string {
    return title.replace(/\s+/g, ' ').replace(/[—–\-]+/g, ' ').replace(/outcome prediction\??/gi, '').replace(/\$[\d,.]+/g, '').replace(/[^\w\s]/g, '').trim().toLowerCase();
}

function jaccardSimilarity(a: string, b: string): number {
    const tokensA = new Set(a.split(/\s+/).filter(w => w.length > 2));
    const tokensB = new Set(b.split(/\s+/).filter(w => w.length > 2));
    if (tokensA.size === 0 || tokensB.size === 0) return 0;
    let intersection = 0;
    for (const t of tokensA) if (tokensB.has(t)) intersection++;
    const union = tokensA.size + tokensB.size - intersection;
    return union > 0 ? intersection / union : 0;
}

async function debugCategory(category: string) {
    const allCandidates: any[] = [];
    console.log(`\n--- Fetching ETL data for ${category} ---`);

    const { data: signals } = await supabase.from('market_signals').select('title, description').eq('category', category).eq('is_active', true).limit(25);
    if (signals) {
        for (const sig of signals) {
            if (!sig.title) continue;
            allCandidates.push({ title: cleanTitle(sig.title), textRaw: `${sig.title} ${sig.description || ''} ${category}`, source: 'signal', category });
        }
    }

    const { data: marketItems } = await supabase.from('market_data_items').select('title, description').eq('category', category).eq('is_active', true).limit(25);
    if (marketItems) {
        for (const item of marketItems) {
            if (!item.title) continue;
            allCandidates.push({ title: cleanTitle(item.title), textRaw: `${item.title} ${item.description || ''} ${category}`, source: 'market', category });
        }
    }

    console.log(`Total Candidates Collected: ${allCandidates.length}`);
    if (allCandidates.length === 0) return;

    const texts = allCandidates.map(c => c.textRaw);
    const vectors = computeTfIdf(texts);
    // test clustering into 8 clusters (like openSlotCount + 3)
    const assignments = kMeansClustering(vectors, 8);
    
    const clusters = new Map<number, any[]>();
    for (let i = 0; i < assignments.length; i++) {
        const clusterId = assignments[i];
        if (!clusters.has(clusterId)) clusters.set(clusterId, []);
        clusters.get(clusterId)!.push(allCandidates[i]);
    }

    console.log(`Clusters formed: ${clusters.size}`);
    const results: any[] = [];
    const usedNormalizedTitles = new Set<string>();

    for (const [clusterId, cluster] of clusters) {
        cluster.sort((a, b) => (a.source === 'signal' ? 3 : 2) - (b.source === 'signal' ? 3 : 2));

        let best: any = null;
        for (const candidate of cluster) {
            const normalized = normalizeForDedup(candidate.title);
            if (usedNormalizedTitles.has(normalized)) continue;

            let tooSimilar = false;
            for (const existing of usedNormalizedTitles) {
                const js = jaccardSimilarity(normalized, existing);
                if (js > 0.55) {
                    console.log(`Rejecting "${candidate.title.substring(0, 40)}" for similarity ${js.toFixed(2)} to "${existing.substring(0, 40)}"`);
                    tooSimilar = true;
                    break;
                }
            }

            if (!tooSimilar) {
                best = candidate;
                usedNormalizedTitles.add(normalized);
                break;
            }
        }

        if (best) results.push({ title: best.title, clusterSize: cluster.length });
    }

    console.log(`Final output topics: ${results.length}`);
    console.log(JSON.stringify(results, null, 2));
}

async function run() {
    await debugCategory('crypto');
    await debugCategory('economy');
}

run().catch(console.error);
