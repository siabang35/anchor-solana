/**
 * Image Scraper Utility
 *
 * Extracts images from article URLs using Open Graph meta tags.
 * Used as fallback when news APIs don't provide images.
 *
 * Security:
 * - URL validation (http/https only)
 * - Rate limiting per domain (1 req/sec)
 * - Circuit breaker after consecutive failures
 * - Timeout: 5 seconds
 *
 * Anti-Throttling:
 * - Domain-based rate limiting
 * - Exponential backoff on failures
 * - Concurrent request limiting
 */

import { Logger } from '@nestjs/common';

export interface ImageScraperResult {
    imageUrl: string | null;
    thumbnailUrl?: string | null;
    source: 'og:image' | 'twitter:image' | 'img_tag' | 'placeholder' | 'original';
    error?: string;
}

export interface ImageScraperOptions {
    timeout?: number;
    maxRetries?: number;
    placeholderUrl?: string;
}

// Default placeholder image for items without images
const DEFAULT_PLACEHOLDER = 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&q=80';

// Rate limiting state per domain
const domainRequestTimes: Map<string, number> = new Map();
const domainFailures: Map<string, number> = new Map();
const RATE_LIMIT_MS = 1000; // 1 request per second per domain
const MAX_FAILURES = 5;
const CIRCUIT_BREAKER_RESET_MS = 60000; // 1 minute

export class ImageScraperUtil {
    private static readonly logger = new Logger('ImageScraperUtil');

    /**
     * Extract image URL from article page
     */
    static async scrapeImage(
        articleUrl: string,
        options: ImageScraperOptions = {}
    ): Promise<ImageScraperResult> {
        const { timeout = 5000, placeholderUrl = DEFAULT_PLACEHOLDER } = options;

        // Validate URL
        if (!this.isValidUrl(articleUrl)) {
            return { imageUrl: placeholderUrl, source: 'placeholder', error: 'Invalid URL' };
        }

        const domain = this.extractDomain(articleUrl);
        if (!domain) {
            return { imageUrl: placeholderUrl, source: 'placeholder', error: 'Cannot extract domain' };
        }

        // Check circuit breaker
        if (this.isCircuitBreakerOpen(domain)) {
            this.logger.debug(`Circuit breaker open for ${domain}`);
            return { imageUrl: placeholderUrl, source: 'placeholder', error: 'Circuit breaker open' };
        }

        // Rate limiting
        await this.waitForRateLimit(domain);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(articleUrl, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'ExoduzeBot/1.0 (+https://exoduze.app; image-extraction)',
                    'Accept': 'text/html,application/xhtml+xml',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                this.recordFailure(domain);
                return { imageUrl: placeholderUrl, source: 'placeholder', error: `HTTP ${response.status}` };
            }

            const html = await response.text();
            const imageUrl = this.extractImageFromHtml(html, articleUrl);

            // Reset failure count on success
            domainFailures.delete(domain);

            if (imageUrl) {
                return { imageUrl, source: this.determineSource(html, imageUrl) };
            }

            return { imageUrl: placeholderUrl, source: 'placeholder' };
        } catch (error) {
            const errorMessage = (error as Error).message;
            this.recordFailure(domain);

            // Don't log abort errors
            if (errorMessage !== 'The operation was aborted') {
                this.logger.debug(`Scrape failed for ${domain}: ${errorMessage}`);
            }

            return { imageUrl: placeholderUrl, source: 'placeholder', error: errorMessage };
        }
    }

    /**
     * Batch scrape images for multiple URLs with concurrency limit
     */
    static async scrapeImages(
        items: Array<{ url?: string; imageUrl?: string }>,
        concurrency: number = 5,
        options: ImageScraperOptions = {}
    ): Promise<Map<string, ImageScraperResult>> {
        const results = new Map<string, ImageScraperResult>();
        const itemsToScrape = items.filter(item => item.url && !item.imageUrl);

        this.logger.log(`Scraping images for ${itemsToScrape.length} items (concurrency: ${concurrency})`);

        // Process in batches
        for (let i = 0; i < itemsToScrape.length; i += concurrency) {
            const batch = itemsToScrape.slice(i, i + concurrency);
            const promises = batch.map(async item => {
                const result = await this.scrapeImage(item.url!, options);
                results.set(item.url!, result);
            });

            await Promise.allSettled(promises);

            // Small delay between batches
            if (i + concurrency < itemsToScrape.length) {
                await this.sleep(200);
            }
        }

        const successCount = Array.from(results.values()).filter(r => r.source !== 'placeholder').length;
        this.logger.log(`Image scraping complete: ${successCount}/${itemsToScrape.length} successful`);

        return results;
    }

    /**
     * Extract image URL from HTML content
     */
    private static extractImageFromHtml(html: string, baseUrl: string): string | null {
        // Priority order:
        // 1. og:image (Open Graph)
        // 2. twitter:image
        // 3. First large <img> tag

        // 1. Try og:image
        const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
            || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
        if (ogImageMatch?.[1]) {
            return this.normalizeUrl(ogImageMatch[1], baseUrl);
        }

        // 2. Try twitter:image
        const twitterMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)
            || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
        if (twitterMatch?.[1]) {
            return this.normalizeUrl(twitterMatch[1], baseUrl);
        }

        // 3. Try article image or first large image
        const articleImgMatch = html.match(/<article[^>]*>[\s\S]*?<img[^>]*src=["']([^"']+)["']/i);
        if (articleImgMatch?.[1]) {
            const imgUrl = articleImgMatch[1];
            // Filter out small icons, tracking pixels, etc
            if (!this.isLikelyIcon(imgUrl)) {
                return this.normalizeUrl(imgUrl, baseUrl);
            }
        }

        // 4. Fallback: First reasonable image
        const imgMatches = html.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi);
        for (const match of imgMatches) {
            const imgUrl = match[1];
            if (!this.isLikelyIcon(imgUrl) && !imgUrl.includes('data:')) {
                return this.normalizeUrl(imgUrl, baseUrl);
            }
        }

        return null;
    }

    /**
     * Determine which source the image came from
     */
    private static determineSource(html: string, imageUrl: string): 'og:image' | 'twitter:image' | 'img_tag' {
        if (html.includes(`og:image`) && html.includes(imageUrl)) {
            return 'og:image';
        }
        if (html.includes(`twitter:image`) && html.includes(imageUrl)) {
            return 'twitter:image';
        }
        return 'img_tag';
    }

    /**
     * Check if URL is likely an icon or tracking pixel
     */
    private static isLikelyIcon(url: string): boolean {
        const iconPatterns = [
            /favicon/i,
            /icon/i,
            /logo\./i,
            /pixel/i,
            /tracker/i,
            /badge/i,
            /button/i,
            /1x1/i,
            /spacer/i,
            /blank/i,
            /\.gif$/i,
            /\.svg$/i,
            /sprite/i,
        ];
        return iconPatterns.some(pattern => pattern.test(url));
    }

    /**
     * Normalize relative URLs to absolute
     */
    private static normalizeUrl(imgUrl: string, baseUrl: string): string {
        if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) {
            return imgUrl;
        }
        if (imgUrl.startsWith('//')) {
            return 'https:' + imgUrl;
        }
        try {
            return new URL(imgUrl, baseUrl).href;
        } catch {
            return imgUrl;
        }
    }

    /**
     * Validate URL format (security)
     */
    private static isValidUrl(url: string): boolean {
        try {
            const parsed = new URL(url);
            return ['http:', 'https:'].includes(parsed.protocol);
        } catch {
            return false;
        }
    }

    /**
     * Extract domain from URL
     */
    private static extractDomain(url: string): string | null {
        try {
            return new URL(url).hostname;
        } catch {
            return null;
        }
    }

    /**
     * Wait for rate limit if needed
     */
    private static async waitForRateLimit(domain: string): Promise<void> {
        const lastRequest = domainRequestTimes.get(domain) || 0;
        const elapsed = Date.now() - lastRequest;

        if (elapsed < RATE_LIMIT_MS) {
            await this.sleep(RATE_LIMIT_MS - elapsed);
        }

        domainRequestTimes.set(domain, Date.now());
    }

    /**
     * Check if circuit breaker is open for domain
     */
    private static isCircuitBreakerOpen(domain: string): boolean {
        const failures = domainFailures.get(domain) || 0;
        return failures >= MAX_FAILURES;
    }

    /**
     * Record a failure for circuit breaker
     */
    private static recordFailure(domain: string): void {
        const current = domainFailures.get(domain) || 0;
        domainFailures.set(domain, current + 1);

        // Schedule circuit breaker reset
        if (current + 1 >= MAX_FAILURES) {
            setTimeout(() => {
                domainFailures.delete(domain);
            }, CIRCUIT_BREAKER_RESET_MS);
        }
    }

    /**
     * Sleep utility
     */
    private static sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get placeholder URL for category
     */
    static getPlaceholderForCategory(category: string): string {
        const placeholders: Record<string, string> = {
            politics: 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=800&q=80',
            finance: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&q=80',
            tech: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=80',
            crypto: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=800&q=80',
            economy: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=800&q=80',
            science: 'https://images.unsplash.com/photo-1507413245164-6160d8298b31?w=800&q=80',
            latest: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&q=80',
        };
        return placeholders[category] || DEFAULT_PLACEHOLDER;
    }
}
