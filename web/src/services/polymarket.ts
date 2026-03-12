export interface PolymarketTeam {
    id: string;
    name: string;
    logo: string; // Changed from image
    league: string; // Changed from sport
    abbreviation?: string;
    color?: string;
}


export interface PolymarketSport {
    id: string;
    label: string;
    active: boolean;
    image?: string;
}

export interface PolymarketMarketType {
    id: string;
    header: string;
}

export interface PolymarketMarket {
    id: string;
    question: string;
    outcomes: string[];
    outcomePrices?: string[];
    volume: string;
    liquidity?: string;
    active: boolean;
    marketType: string;
    sport: string;
    startDate?: string;
    endDate?: string;
    image?: string;
    icon?: string;
    description?: string;
    groupItemTitle?: string;
    team1?: { name: string; symbol: string; icon: string };
    team2?: { name: string; symbol: string; icon: string };
}

const BASE_URL = '/api/polymarket';

export const PolymarketService = {
    // ... existing fetchTeams ... (need to update map if needed, but API returns JSON matching new interface mostly)
    async fetchTeams(): Promise<PolymarketTeam[]> {
        try {
            const response = await fetch(`${BASE_URL}/teams`);
            if (!response.ok) throw new Error('Failed to fetch teams');
            return await response.json();
        } catch (error) {
            console.error('Error fetching teams:', error);
            return [];
        }
    },

    // ... fetchSports, fetchMarketTypes ...

    async fetchSports(): Promise<PolymarketSport[]> {
        try {
            const response = await fetch(`${BASE_URL}/sports`);
            if (!response.ok) throw new Error('Failed to fetch sports');
            return await response.json();
        } catch (error) {
            console.error('Error fetching sports:', error);
            return [];
        }
    },

    async fetchMarketTypes(): Promise<PolymarketMarketType[]> {
        try {
            const response = await fetch(`${BASE_URL}/sports/market-types`);
            if (!response.ok) throw new Error('Failed to fetch market types');
            return await response.json();
        } catch (error) {
            console.error('Error fetching market types:', error);
            return [];
        }
    },

    // Helper to map teams to markets
    enrichMarketsWithTeams(markets: PolymarketMarket[], teams: PolymarketTeam[]): PolymarketMarket[] {
        return markets.map(market => {
            // Try to find teams in outcomes
            const outcomes = market.outcomes || [];
            if (outcomes.length < 2) return market;

            const name1 = outcomes[0];
            const name2 = outcomes[1];

            // Simple exact match or subset match
            // Optimize this with a Map if performance becomes an issue
            const team1 = teams.find(t => t.name === name1 || t.abbreviation === name1 || name1.includes(t.name));
            const team2 = teams.find(t => t.name === name2 || t.abbreviation === name2 || name2.includes(t.name));

            return {
                ...market,
                team1: team1 ? { name: team1.name, symbol: team1.abbreviation || '', icon: team1.logo } : market.team1,
                team2: team2 ? { name: team2.name, symbol: team2.abbreviation || '', icon: team2.logo } : market.team2,
            };
        });
    },

    async fetchEvents({ sport, limit = 20 }: { sport?: string; limit?: number } = {}): Promise<any[]> {
        // Note: The prompt didn't strictly give an events endpoint, 
        // but usually it's /events or /markets. 
        // We will try to infer or use a generic one if we can find one in the code search later 
        // or just assume for now we might need to query the main /events endpoint with a filter.
        // For now, let's look for a generic "events" endpoint that accepts filters.
        // Based on public docs, usually https://gamma-api.polymarket.com/events?closed=false

        try {
            const queryParams = new URLSearchParams({
                closed: 'false',
                limit: limit.toString(),
                ...(sport ? { tags_id: sport } : {}) // This is a guess, might need adjustment
            });

            const response = await fetch(`${BASE_URL}/events?${queryParams.toString()}`);
            if (!response.ok) throw new Error('Failed to fetch events');
            const data = await response.json();

            // Transform data to match interface
            return data.map((item: any) => {
                let parsedOutcomes: string[] = [];
                try {
                    if (Array.isArray(item.outcomes)) {
                        parsedOutcomes = item.outcomes;
                    } else if (typeof item.outcomes === 'string') {
                        parsedOutcomes = JSON.parse(item.outcomes);
                    }
                } catch (e) {
                    console.warn('Failed to parse outcomes', item.outcomes);
                    parsedOutcomes = [];
                }

                // Ensure it's an array for sure
                if (!Array.isArray(parsedOutcomes)) parsedOutcomes = [];

                return {
                    ...item,
                    outcomes: parsedOutcomes,
                    // outcomePrices might be missing in /events, sometimes in a separate 'markets' field or 'tokens'
                    // For now pass what we have, or mock if critical headers are needed
                    outcomePrices: item.outcomePrices || ['0.5', '0.5'], // Fallback for demo
                    image: item.image || item.icon,
                    liquidity: item.liquidity,
                    description: item.description,
                } as PolymarketMarket;
            });
        } catch (error) {
            console.error('Error fetching events:', error);
            return [];
        }
    }
};
