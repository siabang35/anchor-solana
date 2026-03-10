/**
 * Live Feed Controller
 * 
 * REST API for real-time live feed data from market_data_items.
 * Returns data formatted as FeedItem[] for the DataFeeds frontend component.
 */

import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MarketDataService } from './market-data.service.js';

// Source icon mapping
const SOURCE_ICONS: Record<string, string> = {
    'NewsAPI': '📰',
    'GDELT': '🌐',
    'CoinGecko': '🪙',
    'CoinMarketCap': '💰',
    'CryptoPanic': '📊',
    'Alpha Vantage': '💹',
    'FRED': '🏦',
    'HackerNews': '💻',
    'ArXiv': '🔬',
    'SemanticScholar': '📚',
    'WorldBank': '🌍',
    'IMF': '🏛️',
    'OECD': '📈',
    'RSS': '📡',
};

// Impact to normalized format
function normalizeImpact(impact: string): 'high' | 'medium' | 'low' {
    const lower = (impact || 'medium').toLowerCase();
    if (lower === 'critical' || lower === 'high') return 'high';
    if (lower === 'low') return 'low';
    return 'medium';
}

// Sentiment score from DB to numeric
function sentimentToScore(sentiment: string, sentimentScore?: number): number {
    if (sentimentScore !== undefined && sentimentScore !== null) {
        return sentimentScore;
    }
    switch ((sentiment || 'neutral').toLowerCase()) {
        case 'bullish': return 0.3;
        case 'bearish': return -0.3;
        default: return 0;
    }
}

@ApiTags('Live Feed')
@Controller('live-feed')
export class LiveFeedController {
    constructor(private readonly marketDataService: MarketDataService) { }

    /**
     * Get live feed items across all categories
     */
    @Get()
    @ApiOperation({ summary: 'Get live feed items from all categories' })
    @ApiResponse({ status: 200, description: 'Feed items retrieved' })
    async getLiveFeed(
        @Query('limit') limit?: string,
    ) {
        const parsedLimit = parseInt(limit || '20', 10);

        try {
            // Fetch latest items from 'latest' (all categories)
            const result = await this.marketDataService.getByCategory('latest', parsedLimit, 0);
            const items = result.data || [];

            return items.map((item: any, index: number) => ({
                id: item.id || `feed-${Date.now()}-${index}`,
                source: (item.source_name || item.source || 'Unknown').toUpperCase(),
                icon: SOURCE_ICONS[item.source_name || item.source] || '📰',
                text: item.title || item.description || '',
                impact: normalizeImpact(item.impact),
                timestamp: new Date(item.published_at || Date.now()).getTime(),
                sentiment: sentimentToScore(item.sentiment, item.sentiment_score),
                entity: item.category || 'General',
                category: item.category,
                tags: item.tags || [],
            }));
        } catch (error: any) {
            // Return empty array on error, not 500
            return [];
        }
    }

    /**
     * Get live feed items for a specific category
     */
    @Get(':category')
    @ApiOperation({ summary: 'Get live feed items for a specific category' })
    async getLiveFeedByCategory(
        @Param('category') category: string,
        @Query('limit') limit?: string,
    ) {
        const parsedLimit = parseInt(limit || '10', 10);

        try {
            const result = await this.marketDataService.getByCategory(category, parsedLimit, 0);
            const items = result.data || [];

            return items.map((item: any, index: number) => ({
                id: item.id || `feed-${Date.now()}-${index}`,
                source: (item.source_name || item.source || 'Unknown').toUpperCase(),
                icon: SOURCE_ICONS[item.source_name || item.source] || '📰',
                text: item.title || item.description || '',
                impact: normalizeImpact(item.impact),
                timestamp: new Date(item.published_at || Date.now()).getTime(),
                sentiment: sentimentToScore(item.sentiment, item.sentiment_score),
                entity: item.category || 'General',
                category: item.category,
                tags: item.tags || [],
            }));
        } catch (error: any) {
            return [];
        }
    }
}
