import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service.js';

export interface Signal {
    id: string;
    signal_type: string;
    title: string;
    description: string;
    category: string;
    source_type: string;
    confidence_score: number;
    impact: string;
    sentiment: string;
    published_at: string;
    tags: string[];
    url?: string;
    image?: string;
    source_icon?: string;
}

@Injectable()
export class SignalsService {
    private readonly logger = new Logger(SignalsService.name);

    constructor(
        private readonly supabaseService: SupabaseService,
    ) { }

    getSupabaseClient() {
        return this.supabaseService.getClient();
    }

    async findAll(limit: number = 20, offset: number = 0, category?: string): Promise<Signal[]> {
        // Use Admin Client to bypass RLS since public read policy might be missing
        const supabase = this.supabaseService.getAdminClient();

        // Query raw market data items for a richer feed (Polymarket style)
        let query = supabase
            .from('market_data_items')
            .select('*')
            .order('published_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (category && category !== 'all') {
            // Postgres Enums don't support ilike (~~*), use exact match
            // Categories are stored as lowercase in the DB (e.g. 'crypto', 'politics')
            query = query.eq('category', category.toLowerCase());
        }

        const { data, error } = await query;

        if (error) {
            this.logger.error(`Failed to fetch signals: ${error.message}`);
            return [];
        }

        if (!data) return [];

        // Smart Image Fallback Map
        const CATEGORY_IMAGES: Record<string, string> = {
            'crypto': 'https://images.unsplash.com/photo-1518546305927-5a440a11cf44?w=400&q=80', // Bitcoin/Crypto abstract
            'politics': 'https://images.unsplash.com/photo-1529101091760-61df6be46075?w=400&q=80', // Capitol/Vote
            'technology': 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&q=80', // Circuit
            'tech': 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&q=80',
            'science': 'https://images.unsplash.com/photo-1507413245164-6160d8298b31?w=400&q=80', // Lab
            'economy': 'https://images.unsplash.com/photo-1611974765270-ca1258634369?w=400&q=80', // Stock chart
            'finance': 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=400&q=80', // Money/Graph
        };

        const SOURCE_LOGOS: Record<string, string> = {
            'CoinGecko': 'https://static.coingecko.com/s/thumbnail-d5a7c1b76b254a8b741b94d96ab16b9d.png',
            'NewsAPI': 'https://newsapi.org/images/n-logo-border.png',
            'FRED': 'https://fred.stlouisfed.org/images/fred-logo-2x.png',
            'Yahoo Finance': 'https://s.yimg.com/cv/apiv2/default/logo/2018/yahoo_finance_logo_en-US_tm.png',
        };

        // Map market_data_items to Signal interface
        return data.map((item: any) => {
            // Determine best image
            let derivedImage = item.image_url;
            if (!derivedImage) {
                if (item.source === 'CoinGecko') {
                    // For CoinGecko, ideally we'd map the coin ID, but for now use specific crypto images if possible or valid fallback
                    derivedImage = 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?w=400&q=80'; // Generic Crypto visual
                } else {
                    derivedImage = CATEGORY_IMAGES[item.category?.toLowerCase()] || CATEGORY_IMAGES['finance'];
                }
            }

            return {
                id: item.id,
                signal_type: 'news', // Default type
                title: item.title,
                description: item.description || '',
                category: item.category,
                source_type: item.source,
                confidence_score: item.sentiment_score || 0.5,
                impact: (item.impact || 'medium').toUpperCase(),
                sentiment: (item.sentiment || 'neutral').toUpperCase(),
                published_at: item.published_at,
                tags: item.tags || [],
                // Extra fields for the authentic news feel
                url: item.url,
                image: derivedImage,
                source_icon: item.source_name || SOURCE_LOGOS[item.source]
            };
        }) as unknown as Signal[];
    }
}
