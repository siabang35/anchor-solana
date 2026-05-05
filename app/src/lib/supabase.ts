import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables are missing');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    realtime: {
        params: {
            // Increased from 10 → 40 for faster realtime updates
            // Supports high-frequency competition data without throttling
            eventsPerSecond: 40,
        },
    },
    auth: {
        persistSession: false,
    },
    // Connection pooling for better performance
    db: {
        schema: 'public',
    },
    global: {
        headers: {
            'X-Client-Info': 'exoduze-app/2.0',
        },
    },
});

// API base URL for NestJS backend (Fastify-powered)
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
    throw new Error('API_BASE_URL environment variable is missing');
}

// ─── In-flight request deduplication ─────────────────────────────────
// Prevents duplicate concurrent requests for the same endpoint
const inflightRequests = new Map<string, Promise<any>>();

/**
 * Enterprise-grade API fetch with:
 * - Request deduplication (anti-throttling)
 * - Exponential backoff retry with jitter
 * - Path sanitization (anti-manipulation)
 * - ETag support for conditional requests (304 Not Modified)
 * - AbortController timeout protection
 */
export async function apiFetch<T>(path: string, options?: RequestInit, maxRetries = 3): Promise<T> {
    // ── Security: sanitize API path ──
    const sanitizedPath = path
        .replace(/\.\.\//g, '')      // strip path traversal
        .replace(/[^\w\-\/\?\=\&\.\%\+]/g, '') // Allow only safe URL characters
        .replace(/\/+/g, '/');       // collapse double slashes

    if (!sanitizedPath.startsWith('/')) {
        throw new Error('Invalid API path');
    }

    // ── Request deduplication for GET requests ──
    const method = options?.method?.toUpperCase() || 'GET';
    const dedupeKey = method === 'GET' ? `${method}:${sanitizedPath}` : null;

    if (dedupeKey) {
        const inflight = inflightRequests.get(dedupeKey);
        if (inflight) {
            return inflight as Promise<T>;
        }
    }

    const fetchPromise = _doFetch<T>(sanitizedPath, options, maxRetries);

    // Store in-flight promise for dedup
    if (dedupeKey) {
        inflightRequests.set(dedupeKey, fetchPromise);
        fetchPromise.finally(() => {
            inflightRequests.delete(dedupeKey);
        });
    }

    return fetchPromise;
}

// ── ETag cache for conditional requests ──
const etagCache = new Map<string, { etag: string; data: any }>();
const MAX_ETAG_CACHE = 100;

async function _doFetch<T>(path: string, options?: RequestInit, maxRetries: number = 3): Promise<T> {
    let retries = 0;

    while (true) {
        try {
            // Build headers with ETag support
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                ...(options?.headers as Record<string, string> || {}),
            };

            // Add If-None-Match header for conditional GET requests
            const method = options?.method?.toUpperCase() || 'GET';
            const cacheKey = `${method}:${path}`;
            const cached = etagCache.get(cacheKey);
            if (method === 'GET' && cached?.etag) {
                headers['If-None-Match'] = cached.etag;
            }

            // AbortController for request timeout (10s)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10_000);

            const res = await fetch(`${API_BASE_URL}${path}`, {
                headers,
                signal: controller.signal,
                ...options,
            });

            clearTimeout(timeoutId);

            // 304 Not Modified — use cached data (saves bandwidth)
            if (res.status === 304 && cached?.data) {
                return cached.data as T;
            }

            if (!res.ok) {
                const err = await res.json().catch(() => ({ message: res.statusText }));

                // If 429 Too Many Requests and we have retries left, wait and retry
                if (res.status === 429 && retries < maxRetries) {
                    retries++;
                    const retryAfter = res.headers.get('retry-after');
                    const backoff = retryAfter
                        ? parseInt(retryAfter) * 1000
                        : Math.min(1000 * Math.pow(2, retries) + Math.random() * 500, 5000);
                    console.warn(`[apiFetch] 429 Rate Limited. Retrying in ${Math.round(backoff)}ms... (${retries}/${maxRetries})`);
                    await new Promise(r => setTimeout(r, backoff));
                    continue;
                }

                throw new Error(err.message || `API Error: ${res.status}`);
            }

            const data = await res.json();

            // Cache ETag for future conditional requests
            const etag = res.headers.get('etag');
            if (etag && method === 'GET') {
                // Evict oldest if cache is full
                if (etagCache.size >= MAX_ETAG_CACHE) {
                    const oldestKey = etagCache.keys().next().value;
                    if (oldestKey) etagCache.delete(oldestKey);
                }
                etagCache.set(cacheKey, { etag, data });
            }

            return data as T;
        } catch (error: any) {
            // Abort errors shouldn't retry
            if (error.name === 'AbortError') {
                throw new Error('Request timeout — server took too long to respond');
            }

            // Only retry on network errors or 429s (handled above), throw everything else
            if (retries >= maxRetries || (error.message && !error.message.includes('fetch'))) {
                throw error;
            }
            retries++;
            const backoff = 1000 * Math.pow(2, retries);
            console.warn(`[apiFetch] Network error. Retrying in ${backoff}ms... (${retries}/${maxRetries})`);
            await new Promise(r => setTimeout(r, backoff));
        }
    }
}
