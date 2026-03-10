import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service.js';
import { CreateMarketDto, MarketQueryDto, ResolveMarketDto, MarketResponseDto } from './dto/index.js';

interface Market {
    id: string;
    creator_id: string;
    title: string;
    description: string;
    category: string;
    chain: string;
    chain_id: number;
    contract_address?: string;
    collateral_token: string;
    end_time: string;
    resolution_time: string;
    resolved: boolean;
    outcome: boolean | null;
    yes_price: number;
    no_price: number;
    volume: number;
    liquidity: number;
    tags: string[];
    created_at: string;
    updated_at: string;
}

export interface PaginatedResult<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

/**
 * Markets Service
 * 
 * Handles AI agent competition CRUD operations
 */
@Injectable()
export class MarketsService {
    private readonly logger = new Logger(MarketsService.name);

    constructor(
        private readonly supabaseService: SupabaseService,
    ) { }

    /**
     * Create a new AI agent competition
     */
    async create(userId: string, dto: CreateMarketDto): Promise<MarketResponseDto> {
        const supabase = this.supabaseService.getAdminClient();

        // Calculate resolution time if not provided
        const endTime = new Date(dto.endTime);
        const resolutionTime = dto.resolutionTime
            ? new Date(dto.resolutionTime)
            : new Date(endTime.getTime() + 24 * 60 * 60 * 1000); // Default: endTime + 24h

        const { data, error } = await supabase
            .from('markets')
            .insert({
                creator_id: userId,
                title: dto.title,
                description: dto.description,
                category: dto.category,
                chain: dto.chain,
                chain_id: this.getChainId(dto.chain),
                collateral_token: 'USDC',
                end_time: endTime.toISOString(),
                resolution_time: resolutionTime.toISOString(),
                resolved: false,
                outcome: null,
                yes_price: 0.5, // Initial 50/50
                no_price: 0.5,
                volume: 0,
                liquidity: dto.initialLiquidity,
                tags: dto.tags || [],
            })
            .select()
            .single();

        if (error) {
            this.logger.error(`Failed to create market: ${error.message}`);
            throw new Error(`Failed to create market: ${error.message}`);
        }

        this.logger.log(`Market created: ${data.id} by user ${userId}`);
        return this.toResponseDto(data);
    }

    /**
     * Get market by ID
     */
    async findById(id: string): Promise<MarketResponseDto> {
        const supabase = this.supabaseService.getClient();

        const { data, error } = await supabase
            .from('markets')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) {
            throw new NotFoundException(`Market not found: ${id}`);
        }

        return this.toResponseDto(data);
    }

    /**
     * Find markets with filters and pagination
     */
    async findAll(query: MarketQueryDto): Promise<PaginatedResult<MarketResponseDto>> {
        const supabase = this.supabaseService.getClient();
        const page = query.page || 1;
        const limit = query.limit || 20;
        const offset = (page - 1) * limit;

        let queryBuilder = supabase
            .from('markets')
            .select('*', { count: 'exact' });

        // Apply filters
        if (query.category) {
            queryBuilder = queryBuilder.eq('category', query.category);
        }
        if (query.chain) {
            queryBuilder = queryBuilder.eq('chain', query.chain);
        }
        if (query.resolved !== undefined) {
            queryBuilder = queryBuilder.eq('resolved', query.resolved);
        }
        if (query.search) {
            queryBuilder = queryBuilder.ilike('title', `%${query.search}%`);
        }

        // Apply sorting
        const sortField = this.getSortField(query.sortBy || 'created');
        const ascending = query.sortOrder === 'asc';
        queryBuilder = queryBuilder.order(sortField, { ascending });

        // Apply pagination
        queryBuilder = queryBuilder.range(offset, offset + limit - 1);

        const { data, error, count } = await queryBuilder;

        if (error) {
            this.logger.error(`Failed to fetch markets: ${error.message}`);
            throw new Error(`Failed to fetch markets: ${error.message}`);
        }

        return {
            data: (data || []).map(this.toResponseDto),
            total: count || 0,
            page,
            limit,
            totalPages: Math.ceil((count || 0) / limit),
        };
    }

    /**
     * Get featured/trending markets
     */
    async getFeatured(limit: number = 10): Promise<MarketResponseDto[]> {
        const supabase = this.supabaseService.getClient();

        const { data, error } = await supabase
            .from('markets')
            .select('*')
            .eq('resolved', false)
            .order('volume', { ascending: false })
            .limit(limit);

        if (error) {
            this.logger.error(`Failed to fetch featured markets: ${error.message}`);
            return [];
        }

        return (data || []).map(this.toResponseDto);
    }

    /**
     * Get markets by creator
     */
    async findByCreator(creatorId: string): Promise<MarketResponseDto[]> {
        const supabase = this.supabaseService.getClient();

        const { data, error } = await supabase
            .from('markets')
            .select('*')
            .eq('creator_id', creatorId)
            .order('created_at', { ascending: false });

        if (error) {
            this.logger.error(`Failed to fetch creator markets: ${error.message}`);
            return [];
        }

        return (data || []).map(this.toResponseDto);
    }

    /**
     * Resolve a market
     */
    async resolve(
        marketId: string,
        resolverId: string,
        dto: ResolveMarketDto,
    ): Promise<MarketResponseDto> {
        const supabase = this.supabaseService.getAdminClient();

        // Get market
        const market = await this.findById(marketId);

        if (market.resolved) {
            throw new ForbiddenException('Market is already resolved');
        }

        // Check if resolution time has passed
        const now = new Date();
        const resolutionTime = new Date(market.resolutionTime);
        if (now < resolutionTime) {
            throw new ForbiddenException('Market cannot be resolved before resolution time');
        }

        // Update market
        const { data, error } = await supabase
            .from('markets')
            .update({
                resolved: true,
                outcome: dto.outcome,
                updated_at: new Date().toISOString(),
            })
            .eq('id', marketId)
            .select()
            .single();

        if (error) {
            this.logger.error(`Failed to resolve market: ${error.message}`);
            throw new Error(`Failed to resolve market: ${error.message}`);
        }

        this.logger.log(`Market resolved: ${marketId} outcome=${dto.outcome} by ${resolverId}`);
        return this.toResponseDto(data);
    }

    /**
     * Update market prices (called by oracle/AMM)
     */
    async updatePrices(
        marketId: string,
        yesPrice: number,
        noPrice: number,
    ): Promise<void> {
        const supabase = this.supabaseService.getAdminClient();

        await supabase
            .from('markets')
            .update({
                yes_price: yesPrice,
                no_price: noPrice,
                updated_at: new Date().toISOString(),
            })
            .eq('id', marketId);
    }

    /**
     * Convert database record to response DTO
     */
    private toResponseDto(market: Market): MarketResponseDto {
        return {
            id: market.id,
            title: market.title,
            description: market.description,
            category: market.category,
            creator: market.creator_id,
            chain: market.chain,
            chainId: market.chain_id,
            collateralToken: market.collateral_token,
            endTime: market.end_time,
            resolutionTime: market.resolution_time,
            resolved: market.resolved,
            outcome: market.outcome,
            yesPrice: market.yes_price,
            noPrice: market.no_price,
            volume: market.volume,
            liquidity: market.liquidity,
            tags: market.tags || [],
            createdAt: market.created_at,
            updatedAt: market.updated_at,
        };
    }

    /**
     * Get chain ID from chain name
     */
    private getChainId(chain: string): number {
        const chainIds: Record<string, number> = {
            ethereum: 1,
            base: 8453,
            arbitrum: 42161,
            optimism: 10,
            polygon: 137,
        };
        return chainIds[chain] || 1;
    }

    /**
     * Get database field name for sorting
     */
    private getSortField(sortBy: string): string {
        const sortFields: Record<string, string> = {
            created: 'created_at',
            endTime: 'end_time',
            volume: 'volume',
            liquidity: 'liquidity',
        };
        return sortFields[sortBy] || 'created_at';
    }

    /**
     * Get category feed data from market_data_items table
     * This is the primary data source for category pages (Politics, Finance, Tech, etc.)
     * Data is populated by ETL pipelines from various sources
     * 
     * @param category - Category to filter by (or 'latest' for all)
     * @param limit - Max items to return (capped at 100 for anti-throttling)
     * @param offset - Pagination offset
     * @param search - Optional search query (searches title, description, source, tags)
     * @param sortBy - Sort field: 'relevance', 'date', 'engagement'
     * 
     * OWASP Security:
     * - A03:2021 Injection: SQL wildcards escaped, parameterized queries via Supabase
     * - Anti-throttling: Limit capped at 100, offset validated
     */
    async findCategoryFeed(
        category: string,
        limit: number = 20,
        offset: number = 0,
        search?: string,
        sortBy: 'relevance' | 'date' | 'engagement' = 'date'
    ): Promise<{ data: any[]; total: number; hasMore: boolean }> {
        // Use AdminClient to bypass potential RLS issues for public read
        const supabase = this.supabaseService.getAdminClient();

        // Anti-throttling: Enforce safe limits (OWASP A04:2021)
        const safeLimit = Math.min(Math.max(limit, 1), 100);
        const safeOffset = Math.max(offset, 0);

        // OWASP A03:2021 Injection Prevention: Sanitize search input
        let sanitizedSearch = '';
        if (search && search.trim().length > 0) {
            // Remove SQL wildcards and special characters
            sanitizedSearch = search
                .replace(/[%_'";\\]/g, '') // Remove SQL special chars
                .replace(/[<>]/g, '') // Remove HTML brackets
                .trim()
                .toLowerCase();

            // Limit search length to prevent DoS
            if (sanitizedSearch.length > 100) {
                sanitizedSearch = sanitizedSearch.substring(0, 100);
            }

            // Minimum search length
            if (sanitizedSearch.length < 2) {
                sanitizedSearch = '';
            }
        }

        let query = supabase
            .from('market_data_items')
            .select('*', { count: 'exact' })
            .eq('is_active', true)
            .eq('is_duplicate', false);

        // Filter by category unless 'latest' (which shows all categories)
        if (category && category !== 'latest' && category !== 'all') {
            query = query.eq('category', category.toLowerCase());
        }

        // Multi-field search filter using Supabase's OR query
        if (sanitizedSearch) {
            // Use Supabase's .or() for multi-field search
            // Searches across: title, description, source_name
            query = query.or(
                `title.ilike.%${sanitizedSearch}%,` +
                `description.ilike.%${sanitizedSearch}%,` +
                `source_name.ilike.%${sanitizedSearch}%`
            );
        }

        // Apply sorting based on preference
        switch (sortBy) {
            case 'engagement':
                // Use relevance_score as proxy for engagement since engagement_score is not in schema
                query = query.order('relevance_score', { ascending: false, nullsFirst: false });
                break;
            case 'relevance':
                // For relevance, prioritize higher confidence/relevance scores
                query = query.order('relevance_score', { ascending: false, nullsFirst: false });
                break;
            case 'date':
            default:
                query = query.order('published_at', { ascending: false });
                break;
        }

        // Apply pagination
        query = query.range(safeOffset, safeOffset + safeLimit - 1);

        const { data, error, count } = await query;

        if (error) {
            this.logger.error(`Failed to fetch category feed for ${category}: ${error.message}`);
            return { data: [], total: 0, hasMore: false };
        }

        const total = count || 0;
        const hasMore = (safeOffset + safeLimit) < total;

        // Transform to consistent response format with search relevance indicator
        const transformedData = (data || []).map((item: any) => {
            // Calculate a simple relevance boost for search matches
            let searchRelevance = 0;
            if (sanitizedSearch && item.title) {
                const titleLower = item.title.toLowerCase();
                if (titleLower.includes(sanitizedSearch)) {
                    searchRelevance = titleLower.startsWith(sanitizedSearch) ? 1.0 : 0.8;
                } else if (item.description?.toLowerCase().includes(sanitizedSearch)) {
                    searchRelevance = 0.5;
                } else {
                    searchRelevance = 0.3;
                }
            }

            return {
                id: item.id,
                title: item.title,
                description: item.description,
                category: item.category,
                source: item.source_name || item.source,
                publishedAt: item.published_at,
                impact: item.impact || 'medium',
                sentiment: item.sentiment || 'neutral',
                sentimentScore: item.sentiment_score || 0,
                relevanceScore: sanitizedSearch ? searchRelevance : (item.relevance_score || 0.5),
                confidenceScore: item.confidence_score || 0.5,
                imageUrl: item.image_url,
                url: item.url,
                tags: item.tags || [],
                // Add market-like properties for frontend compatibility
                outcomes: item.market_potential ? [
                    { id: `${item.id}-yes`, label: 'Yes', probability: 50 },
                    { id: `${item.id}-no`, label: 'No', probability: 50 }
                ] : undefined,
                volume: item.engagement_score || 0,
                timeframe: 'New',
            };
        });

        // If searching, sort by relevance score client-side for better results
        if (sanitizedSearch) {
            transformedData.sort((a: any, b: any) => b.relevanceScore - a.relevanceScore);
        }

        return { data: transformedData, total, hasMore };
    }


    // ==========================================
    // Auto Market Generation (for ETL)
    // ==========================================

    /**
     * Create a politics market from a detected political event
     */
    async createPoliticsMarket(params: {
        title: string;
        description: string;
        endTime: Date;
        tags?: string[];
        source?: string;
        externalEventId?: string;
    }): Promise<MarketResponseDto | null> {
        const supabase = this.supabaseService.getAdminClient();

        // Check for duplicate market (by similar title)
        const normalizedTitle = params.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        const { data: existing } = await supabase
            .from('markets')
            .select('id')
            .eq('category', 'politics')
            .ilike('title', `%${params.title.substring(0, 50)}%`)
            .single();

        if (existing) {
            this.logger.debug(`Skipping duplicate politics market: ${params.title.substring(0, 50)}...`);
            return null;
        }

        try {
            const { data, error } = await supabase
                .from('markets')
                .insert({
                    creator_id: '00000000-0000-0000-0000-000000000000', // System user
                    title: this.sanitizeMarketTitle(params.title),
                    description: this.sanitizeDescription(params.description),
                    category: 'politics',
                    chain: 'base',
                    chain_id: 8453,
                    collateral_token: 'USDC',
                    end_time: params.endTime.toISOString(),
                    resolution_time: new Date(params.endTime.getTime() + 24 * 60 * 60 * 1000).toISOString(),
                    resolved: false,
                    outcome: null,
                    yes_price: 0.5,
                    no_price: 0.5,
                    volume: 0,
                    liquidity: 0,
                    tags: [...(params.tags || []), 'auto-generated', 'politics'],
                    metadata: {
                        source: params.source || 'etl',
                        externalEventId: params.externalEventId,
                        autoGenerated: true,
                        generatedAt: new Date().toISOString(),
                    }
                })
                .select()
                .single();

            if (error) {
                this.logger.warn(`Failed to create politics market: ${error.message}`);
                return null;
            }

            this.logger.log(`Auto-created politics market: ${data.id} - ${params.title.substring(0, 50)}...`);
            return this.toResponseDto(data);
        } catch (error) {
            this.logger.error(`Error creating politics market: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Generate election market from detected election news
     */
    async generateElectionMarket(params: {
        candidate1: string;
        candidate2?: string;
        electionType: string; // 'presidential', 'senate', 'governor', etc.
        country: string;
        region?: string;
        electionDate: Date;
    }): Promise<MarketResponseDto | null> {
        const title = params.candidate2
            ? `Will ${params.candidate1} defeat ${params.candidate2} in the ${params.country} ${params.electionType} election?`
            : `Will ${params.candidate1} win the ${params.country} ${params.electionType} election?`;

        const description = `AI agent competition for the ${params.country} ${params.electionType} election` +
            (params.region ? ` in ${params.region}` : '') +
            `. Election date: ${params.electionDate.toISOString().split('T')[0]}.`;

        return this.createPoliticsMarket({
            title,
            description,
            endTime: params.electionDate,
            tags: ['election', params.electionType, params.country, params.candidate1],
        });
    }

    /**
     * Generate legislation market from detected bill/policy news
     */
    async generateLegislationMarket(params: {
        billName: string;
        description: string;
        chamber?: string; // 'senate', 'house', 'parliament'
        country: string;
        deadline?: Date;
    }): Promise<MarketResponseDto | null> {
        const title = params.chamber
            ? `Will the ${params.chamber} pass ${params.billName}?`
            : `Will ${params.billName} become law in ${params.country}?`;

        // Default deadline: 30 days from now if not specified
        const endTime = params.deadline || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        return this.createPoliticsMarket({
            title,
            description: params.description,
            endTime,
            tags: ['legislation', params.country, params.chamber || 'congress'],
        });
    }

    /**
     * Generate market from a political event/news item
     */
    async generateMarketFromEvent(params: {
        eventTitle: string;
        eventDescription: string;
        eventType: 'election' | 'legislation' | 'policy' | 'summit' | 'general';
        entities: string[];
        deadline?: Date;
    }): Promise<MarketResponseDto | null> {
        // Generate a prediction question from the event
        const questionTemplate = this.generatePredictionQuestion(params.eventTitle, params.eventType);

        if (!questionTemplate) {
            return null;
        }

        const endTime = params.deadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Default: 7 days

        return this.createPoliticsMarket({
            title: questionTemplate,
            description: params.eventDescription,
            endTime,
            tags: [params.eventType, ...params.entities.slice(0, 5)],
        });
    }

    /**
     * Generate prediction question from event title
     */
    private generatePredictionQuestion(title: string, eventType: string): string | null {
        const lowerTitle = title.toLowerCase();

        // Skip if already a question
        if (title.endsWith('?')) {
            return title;
        }

        // Election-related patterns
        if (lowerTitle.includes('election') || lowerTitle.includes('vote')) {
            if (lowerTitle.includes('win')) {
                return title.replace(/will|could|may/i, 'Will') + '?';
            }
            return `Will the outcome of "${title.substring(0, 80)}" be favorable to the leading candidate?`;
        }

        // Legislation patterns
        if (lowerTitle.includes('bill') || lowerTitle.includes('legislation') || lowerTitle.includes('law')) {
            return `Will ${title.substring(0, 80)} be passed?`;
        }

        // Policy patterns
        if (lowerTitle.includes('policy') || lowerTitle.includes('reform')) {
            return `Will ${title.substring(0, 80)} be implemented successfully?`;
        }

        // Summit/meeting patterns
        if (lowerTitle.includes('summit') || lowerTitle.includes('meeting') || lowerTitle.includes('talks')) {
            return `Will ${title.substring(0, 80)} result in an agreement?`;
        }

        // General fallback - only create market if high-impact
        if (eventType === 'general' && this.isHighImpactEvent(title)) {
            return `${title.substring(0, 100)}?`;
        }

        return null;
    }

    /**
     * Check if event is high-impact enough for market creation
     */
    private isHighImpactEvent(title: string): boolean {
        const highImpactKeywords = [
            'president', 'prime minister', 'breaking', 'major', 'historic',
            'unprecedented', 'crisis', 'war', 'treaty', 'agreement', 'resign',
            'impeach', 'scandal', 'investigation', 'sanctions', 'tariff'
        ];
        const lowerTitle = title.toLowerCase();
        return highImpactKeywords.some(keyword => lowerTitle.includes(keyword));
    }

    /**
     * Sanitize market title (OWASP compliant)
     */
    private sanitizeMarketTitle(title: string): string {
        return title
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/[<>'"&]/g, '') // Remove special chars
            .substring(0, 200)
            .trim();
    }

    /**
     * Sanitize description (OWASP compliant)
     */
    private sanitizeDescription(description: string): string {
        return description
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/javascript:/gi, '') // Prevent JS injection
            .substring(0, 2000)
            .trim();
    }
    /**
     * Get Top Markets using advanced weighted ranking algorithm
     * Score = Volume (40%) + Liquidity (30%) + Sentiment (20%) + Freshness (10%)
     */
    async getTopMarkets(limit: number = 10): Promise<MarketResponseDto[]> {
        const supabase = this.supabaseService.getClient();

        // Fetch candidates (resolved=false, high volume or recent)
        // We fetch more than limit to allow ranking
        const { data, error } = await supabase
            .from('markets')
            .select('*')
            .eq('resolved', false)
            .order('volume', { ascending: false })
            .limit(100);

        if (error) {
            this.logger.error(`Failed to fetch top markets candidates: ${error.message}`);
            return [];
        }

        const markets = data || [];
        if (markets.length === 0) return [];

        // Normalization helpers
        const maxVol = Math.max(...markets.map(m => m.volume)) || 1;
        const maxLiq = Math.max(...markets.map(m => m.liquidity)) || 1;
        const now = Date.now();

        // Rank
        const ranked = markets.map(market => {
            const volScore = market.volume / maxVol;
            const liqScore = market.liquidity / maxLiq;

            // Sentiment Intensity (deviation from 0.5)
            const price = market.yes_price || 0.5;
            const sentimentScore = Math.abs(price - 0.5) * 2;

            // Freshness (decay over 7 days)
            const ageHours = (now - new Date(market.created_at).getTime()) / (1000 * 60 * 60);
            const timeScore = Math.max(0, 1 - (ageHours / 168));

            // Weighted Score
            const score = (volScore * 0.4) + (liqScore * 0.3) + (sentimentScore * 0.2) + (timeScore * 0.1);

            return { ...market, score };
        });

        // Sort and take limit
        return ranked
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(this.toResponseDto);
    }

    /**
     * Get "For You" Recommendations using K-Means Clustering
     * Filters out markets already shown in Top Markets
     */
    async getRecommendationsForYou(userId: string | null, limit: number = 10): Promise<MarketResponseDto[]> {
        const supabase = this.supabaseService.getClient();

        // 1. Get Top Markets IDs to exclude (Mutual Exclusion)
        const topMarkets = await this.getTopMarkets(10);
        const excludedIds = new Set(topMarkets.map(m => m.id));

        // 2. Fetch candidates
        const { data, error } = await supabase
            .from('markets')
            .select('*')
            .eq('resolved', false)
            .limit(200); // Larger pool for clustering

        if (error) {
            this.logger.error(`Failed to fetch recommendation candidates: ${error.message}`);
            return [];
        }

        let markets = (data || []).filter(m => !excludedIds.has(m.id));

        if (markets.length === 0) return [];
        if (markets.length < 5) return markets.map(this.toResponseDto);

        // 3. K-Means Clustering
        // Feature Vector: [NormVolume, NormLiquidity, Sentiment]
        // Simplified for backend speed (no category one-hot for now to keep it efficient)

        const maxVol = Math.max(...markets.map(m => m.volume)) || 1;

        const vectors = markets.map(m => ([
            m.volume / maxVol,
            (m.yes_price || 0.5)
        ]));

        const k = 5;
        let centroids = vectors.slice(0, k);
        let assignments = new Array(markets.length).fill(0);

        // Iterate 5 times
        for (let i = 0; i < 5; i++) {
            assignments = vectors.map(vec => {
                let minDist = Infinity;
                let clusterIdx = 0;
                centroids.forEach((cent, cIdx) => {
                    const dist = Math.sqrt(Math.pow(vec[0] - cent[0], 2) + Math.pow(vec[1] - cent[1], 2));
                    if (dist < minDist) {
                        minDist = dist;
                        clusterIdx = cIdx;
                    }
                });
                return clusterIdx;
            });

            // Update centroids
            centroids = centroids.map((_, cIdx) => {
                const points = vectors.filter((_, idx) => assignments[idx] === cIdx);
                if (points.length === 0) return vectors[Math.floor(Math.random() * vectors.length)];
                return [
                    points.reduce((sum, p) => sum + p[0], 0) / points.length,
                    points.reduce((sum, p) => sum + p[1], 0) / points.length
                ];
            });
        }

        // 4. Recommendation Strategy
        // Simulate User Preference: Prefer clusters with high volume but lower price (value buys) or controversial
        // For now, we return a diverse mix from the top 3 clusters logic

        // Simply score them by distance to "Ideal Vector" (High Vol, 0.5 Price = High Activity/Controversy)
        // Ideal = [1.0, 0.5]

        const scoredRecommendations = markets.map((market, idx) => {
            const vec = vectors[idx];
            // Distance to Ideal [1, 0.5]
            const dist = Math.sqrt(Math.pow(vec[0] - 1, 2) + Math.pow(vec[1] - 0.5, 2));
            return { market, score: -dist }; // Closer is better (higher score)
        });

        return scoredRecommendations
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(item => this.toResponseDto(item.market));
    }
}
