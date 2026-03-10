/**
 * Market API Clients Index
 * 
 * Re-exports all API clients for easy importing
 */

// Base client
export { BaseAPIClient } from './base-api.client.js';
export type { RateLimitConfig, RequestOptions } from './base-api.client.js';

// News APIs
export { NewsAPIClient, NEWS_CATEGORY_QUERIES, NEWS_CATEGORY_DOMAINS } from './newsapi.client.js';
export type { NewsArticle, NewsAPIResponse } from './newsapi.client.js';

export { GDELTClient } from './gdelt.client.js';
export type { GDELTEvent, GDELTArticle } from './gdelt.client.js';

// Crypto APIs
export {
    CryptoClient,
    CoinGeckoClient,
    CryptoPanicClient,
    FEATURED_CRYPTO_IDS
} from './crypto.client.js';
// Export CoinMarketCapClient from its own file
export { CoinMarketCapClient } from './coinmarketcap.client.js';
export type { CMCQuote } from './coinmarketcap.client.js';
export type { CryptoAsset, CryptoNews, FearGreedIndex } from './crypto.client.js';

// Finance APIs
export { AlphaVantageClient } from './alpha-vantage.client.js';
export type { StockQuote, EconomicIndicator } from './alpha-vantage.client.js';

// Tech APIs
export { HackerNewsClient } from './hackernews.client.js';
export type { HNStory, HNTransformed } from './hackernews.client.js';

// Science APIs
export {
    ScienceClient,
    SemanticScholarClient,
    ArxivClient
} from './science.client.js';
export type { SciencePaper } from './science.client.js';

// Economy APIs
// Economy APIs
export { WorldBankClient, KEY_INDICATORS } from './worldbank.client.js';
export type { WorldBankIndicator, WorldBankDataPoint, CountryInfo } from './worldbank.client.js';

export { IMFClient } from './imf.client.js';
export type { IMFDataPoint, IMFDataStructure } from './imf.client.js';

export { OECDClient } from './oecd.client.js';
export type { OECDDataPoint } from './oecd.client.js';

// RSS Clients
export { RSSClient } from './rss.client.js';

// FRED Client
export { FREDClient } from './fred.client.js';

