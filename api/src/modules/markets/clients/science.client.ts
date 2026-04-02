/**
 * Science API Client
 * 
 * Unified client for scientific research data from multiple sources:
 * - Semantic Scholar (papers, citations)
 * - arXiv (preprints)
 * - CrossRef (DOI resolution)
 * - PubMed (biomedical)
 */

import { Injectable } from '@nestjs/common';
import { BaseAPIClient, RateLimitConfig } from './base-api.client.js';

// ========================
// Type Definitions
// ========================

export interface SciencePaper {
    id: string;
    externalId: string;
    source: 'semantic_scholar' | 'arxiv' | 'pubmed';
    title: string;
    abstract?: string;
    authors: { name: string; authorId?: string }[];
    venue?: string;
    year?: number;
    publicationDate?: Date;
    citationCount: number;
    referenceCount: number;
    isOpenAccess: boolean;
    pdfUrl?: string;
    paperUrl: string;
    fieldsOfStudy?: string[];
    tldr?: string;
}

// ========================
// Semantic Scholar Client
// ========================

const SEMANTIC_SCHOLAR_RATE_LIMIT: RateLimitConfig = {
    requestsPerMinute: 20,
    requestsPerDay: 5000,
    retryAfterMs: 60000,
};

@Injectable()
export class SemanticScholarClient extends BaseAPIClient {
    constructor() {
        super(
            'SemanticScholarClient',
            'https://api.semanticscholar.org/graph/v1',
            process.env.SEMANTIC_SCHOLAR_API_KEY,
            SEMANTIC_SCHOLAR_RATE_LIMIT
        );
    }

    protected getAuthHeaders(): Record<string, string> {
        return this.apiKey ? { 'x-api-key': this.apiKey } : {};
    }

    /**
     * Search for papers
     */
    async searchPapers(
        query: string,
        options: {
            limit?: number;
            fields?: string[];
            year?: string;
        } = {}
    ): Promise<SciencePaper[]> {
        const sanitizedQuery = encodeURIComponent(this.sanitizeInput(query));
        const fields = options.fields || [
            'paperId', 'title', 'abstract', 'authors', 'venue', 'year',
            'citationCount', 'referenceCount', 'isOpenAccess', 'openAccessPdf',
            'fieldsOfStudy', 'tldr', 'publicationDate', 'url'
        ];

        const params = new URLSearchParams({
            query: sanitizedQuery,
            limit: String(options.limit || 20),
            fields: fields.join(','),
        });

        if (options.year) {
            params.set('year', options.year);
        }

        const endpoint = `/paper/search?${params.toString()}`;

        try {
            // Use shorter timeout for Semantic Scholar (sometimes slow)
            const response = await this.makeRequest<{ data?: any[] }>(endpoint, { timeout: 15000, retries: 1 });

            if (!response.data || !Array.isArray(response.data)) {
                this.logger.debug(`Semantic Scholar returned no data for query: ${query}`);
                return [];
            }

            return response.data.map(paper => this.transformSemanticScholarPaper(paper));
        } catch (error) {
            const msg = (error as Error).message;
            // Handle network failures gracefully
            if (msg.includes('fetch failed') || msg.includes('ENOTFOUND') || msg.includes('ETIMEDOUT')) {
                this.logger.debug(`Semantic Scholar unavailable - network issue`);
                return [];
            }
            this.logger.warn(`Failed to search papers: ${msg}`);
            return []; // Return empty instead of throwing
        }
    }

    /**
     * Get paper by ID
     */
    async getPaper(paperId: string): Promise<SciencePaper | null> {
        const fields = [
            'paperId', 'title', 'abstract', 'authors', 'venue', 'year',
            'citationCount', 'referenceCount', 'isOpenAccess', 'openAccessPdf',
            'fieldsOfStudy', 'tldr', 'publicationDate', 'url'
        ];

        const endpoint = `/paper/${paperId}?fields=${fields.join(',')}`;

        try {
            const paper = await this.makeRequest<any>(endpoint);
            return this.transformSemanticScholarPaper(paper);
        } catch (error) {
            this.logger.error(`Failed to get paper ${paperId}: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Get trending papers by field
     */
    async getTrendingPapers(
        field: string,
        limit: number = 20
    ): Promise<SciencePaper[]> {
        // Search for papers in the field, sorted by recent citations
        return this.searchPapers(field, { limit });
    }

    private transformSemanticScholarPaper(paper: any): SciencePaper {
        return {
            id: `ss_${paper.paperId}`,
            externalId: paper.paperId,
            source: 'semantic_scholar',
            title: paper.title,
            abstract: paper.abstract,
            authors: (paper.authors || []).map((a: any) => ({
                name: a.name,
                authorId: a.authorId,
            })),
            venue: paper.venue,
            year: paper.year,
            publicationDate: paper.publicationDate ? new Date(paper.publicationDate) : undefined,
            citationCount: paper.citationCount || 0,
            referenceCount: paper.referenceCount || 0,
            isOpenAccess: paper.isOpenAccess || false,
            pdfUrl: paper.openAccessPdf?.url,
            paperUrl: paper.url || `https://www.semanticscholar.org/paper/${paper.paperId}`,
            fieldsOfStudy: paper.fieldsOfStudy,
            tldr: paper.tldr?.text,
        };
    }
}

// ========================
// arXiv Client
// ========================

const ARXIV_RATE_LIMIT: RateLimitConfig = {
    requestsPerMinute: 60,
    requestsPerDay: 10000,
    retryAfterMs: 5000,
};

@Injectable()
export class ArxivClient extends BaseAPIClient {
    constructor() {
        super(
            'ArxivClient',
            'http://export.arxiv.org/api',
            undefined,
            ARXIV_RATE_LIMIT
        );
    }

    protected getAuthHeaders(): Record<string, string> {
        return {};
    }

    /**
     * Search arXiv papers
     */
    async searchPapers(
        query: string,
        options: {
            maxResults?: number;
            categories?: string[];
            sortBy?: 'relevance' | 'lastUpdatedDate' | 'submittedDate';
        } = {}
    ): Promise<SciencePaper[]> {
        const sanitizedQuery = this.sanitizeInput(query);
        const maxResults = Math.min(options.maxResults || 20, 100);
        const sortBy = options.sortBy || 'submittedDate';

        let searchQuery = `all:${encodeURIComponent(sanitizedQuery)}`;
        if (options.categories && options.categories.length > 0) {
            const catQuery = options.categories.map(c => `cat:${c}`).join(' OR ');
            searchQuery = `(${searchQuery}) AND (${catQuery})`;
        }

        const endpoint = `/query?search_query=${searchQuery}&start=0&max_results=${maxResults}&sortBy=${sortBy}&sortOrder=descending`;

        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`);
            const xml = await response.text();
            return this.parseArxivResponse(xml);
        } catch (error) {
            const msg = (error as Error).message;
            if (msg.includes('fetch failed') || msg.includes('ENOTFOUND')) {
                this.logger.debug(`arXiv unavailable - network issue`);
            } else {
                this.logger.warn(`Failed to search arXiv: ${msg}`);
            }
            return [];
        }
    }

    /**
     * Get recent papers by category
     */
    async getRecentPapers(
        category: string,
        maxResults: number = 20
    ): Promise<SciencePaper[]> {
        const endpoint = `/query?search_query=cat:${category}&start=0&max_results=${maxResults}&sortBy=submittedDate&sortOrder=descending`;

        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`);
            const xml = await response.text();
            return this.parseArxivResponse(xml);
        } catch (error) {
            const msg = (error as Error).message;
            if (msg.includes('fetch failed') || msg.includes('ENOTFOUND')) {
                this.logger.debug(`arXiv unavailable for ${category} - network issue`);
            } else {
                this.logger.warn(`Failed to get recent papers for ${category}: ${msg}`);
            }
            return [];
        }
    }

    private parseArxivResponse(xml: string): SciencePaper[] {
        const papers: SciencePaper[] = [];

        // Simple XML parsing (consider using xml2js for production)
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
        let match;

        while ((match = entryRegex.exec(xml)) !== null) {
            const entry = match[1];

            const getId = (tag: string) => {
                const m = entry.match(new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`));
                return m ? m[1].trim() : '';
            };

            const getAll = (tag: string) => {
                const results: string[] = [];
                const regex = new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, 'g');
                let m;
                while ((m = regex.exec(entry)) !== null) {
                    results.push(m[1].trim());
                }
                return results;
            };

            // Get authors
            const authorRegex = /<author>\s*<name>([^<]*)<\/name>/g;
            const authors: { name: string }[] = [];
            let authorMatch;
            while ((authorMatch = authorRegex.exec(entry)) !== null) {
                authors.push({ name: authorMatch[1].trim() });
            }

            const id = getId('id');
            const arxivId = id.split('/abs/').pop() || id;

            papers.push({
                id: `arxiv_${arxivId}`,
                externalId: arxivId,
                source: 'arxiv',
                title: getId('title').replace(/\s+/g, ' '),
                abstract: getId('summary').replace(/\s+/g, ' '),
                authors,
                publicationDate: new Date(getId('published')),
                citationCount: 0,
                referenceCount: 0,
                isOpenAccess: true,
                pdfUrl: id.replace('/abs/', '/pdf/') + '.pdf',
                paperUrl: id,
                fieldsOfStudy: getAll('category').map(c => c.replace(/^([^.]+)\..*/, '$1')),
            });
        }

        return papers;
    }
}

// ========================
// Unified Science Client
// ========================

@Injectable()
export class ScienceClient {
    constructor(
        private readonly semanticScholar: SemanticScholarClient,
        private readonly arxiv: ArxivClient
    ) { }

    /**
     * Search papers across all sources
     */
    async searchPapers(
        query: string,
        limit: number = 20
    ): Promise<SciencePaper[]> {
        const [ssResults, arxivResults] = await Promise.allSettled([
            this.semanticScholar.searchPapers(query, { limit }),
            this.arxiv.searchPapers(query, { maxResults: limit }),
        ]);

        const papers: SciencePaper[] = [];

        if (ssResults.status === 'fulfilled') {
            papers.push(...ssResults.value);
        }
        if (arxivResults.status === 'fulfilled') {
            papers.push(...arxivResults.value);
        }

        // Sort by citation count and return top results
        return papers
            .sort((a, b) => b.citationCount - a.citationCount)
            .slice(0, limit);
    }

    /**
     * Get trending AI/ML papers
     */
    async getTrendingAIPapers(limit: number = 20): Promise<SciencePaper[]> {
        return this.searchPapers('artificial intelligence machine learning', limit);
    }

    /**
     * Get recent arXiv papers by category
     */
    async getRecentPapersByCategory(category: string, limit: number = 20): Promise<SciencePaper[]> {
        return this.arxiv.getRecentPapers(category, limit);
    }

    /**
     * Check if any client can make requests
     */
    canMakeRequest(): boolean {
        return this.semanticScholar.canMakeRequest() || this.arxiv.canMakeRequest();
    }
}
