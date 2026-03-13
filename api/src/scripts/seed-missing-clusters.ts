import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import * as crypto from 'crypto';

dotenv.config({ path: resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function hashSnapshot(data: any): string {
    const str = JSON.stringify(data);
    return crypto.createHash('sha256').update(str).digest('hex');
}

async function seedClusters() {
    console.log('Fetching active competitions to seed initial structural clusters...');
    const { data: comps, error: fetchErr } = await supabase.from('competitions').select('id, title, sector, metadata').in('status', ['active', 'upcoming']);
    
    if (fetchErr) {
        console.error('Failed to fetch competitions:', fetchErr);
        return;
    }

    if (!comps || comps.length === 0) {
        console.log('No active competitions found. Please ensure clustering service runs first.');
        return;
    }

    console.log(`Found ${comps.length} active competitions.`);
    
    let seededCount = 0;

    for (const comp of comps) {
        // Check if this competition already has a cluster
        const { data: existingClusters } = await supabase.from('news_clusters').select('id').eq('competition_id', comp.id).limit(1);
        
        if (existingClusters && existingClusters.length > 0) {
            continue; // Skip, already has data
        }

        // Generate synthetic initial cluster based on competition metadata
        const mockArticles = [
            `https://news.example.com/article/${comp.id}-1`,
            `https://news.example.com/article/${comp.id}-2`
        ];
        
        const clusterData = { title: comp.title, articles: mockArticles };
        const clusterHash = hashSnapshot(clusterData);
        
        // Random sentiment based on math context or slightly positive
        const sentiment = (Math.random() * 0.4) - 0.1; // -0.1 to 0.3
        
        const initialSignals = [
            {
                type: 'analyst_consensus',
                strength: 0.8,
                direction: sentiment > 0 ? 1 : -1,
                sourceCredibility: 1.2
            }
        ];

        const { error: insertErr } = await supabase.from('news_clusters').insert({
            competition_id: comp.id,
            cluster_hash: clusterHash,
            article_urls: mockArticles,
            signals: initialSignals,
            sentiment: sentiment
        });

        if (insertErr) {
            console.error(`Failed to seed cluster for competition ${comp.id}:`, insertErr);
        } else {
            console.log(`Seeded structural initial cluster for [${comp.sector}] ${comp.title}`);
            seededCount++;
            
            // Generate an initial curve snapshot to trigger probability updates
            await supabase.from('curve_snapshots').insert({
                competition_id: comp.id,
                news_cluster_id: null, // Initial anchor
                probability: parseFloat((0.5 + Math.random() * 0.05).toFixed(4)), 
                snapshot_hash: hashSnapshot({ compId: comp.id, init: true }),
                reasoning: `Initial Bayesian anchor established for mathematical boundary: ${comp.metadata?.math_context || 'Standard Drift'}.`
            });
        }
    }
    
    console.log(`Finished seeding ${seededCount} structural clusters and probability curves.`);
}

seedClusters().catch(console.error);
