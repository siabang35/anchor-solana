import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables are missing');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    realtime: {
        params: {
            eventsPerSecond: 10,
        },
    },
    auth: {
        persistSession: false,
    },
});

// API base URL for NestJS backend
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
    throw new Error('API_BASE_URL environment variable is missing');
}

// Helper: fetch from backend API
export async function apiFetch<T>(path: string, options?: RequestInit, maxRetries = 3): Promise<T> {
    let retries = 0;

    // ── Security: sanitize API path ──
    const sanitizedPath = path
        .replace(/\.\.\//g, '')      // strip path traversal
        .replace(/[^\w\-\/\?\=\&\.\%\+]/g, '') // Allow only safe URL characters
        .replace(/\/+/g, '/');       // collapse double slashes

    if (!sanitizedPath.startsWith('/')) {
        throw new Error('Invalid API path');
    }


    while (true) {
        try {
            const res = await fetch(`${API_BASE_URL}${sanitizedPath}`, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(options?.headers || {}),
                },
                ...options,
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ message: res.statusText }));

                // If 429 Too Many Requests and we have retries left, wait and retry
                if (res.status === 429 && retries < maxRetries) {
                    retries++;
                    const backoff = Math.min(1000 * Math.pow(2, retries) + Math.random() * 500, 5000);
                    console.warn(`[apiFetch] 429 Rate Limited. Retrying in ${Math.round(backoff)}ms... (${retries}/${maxRetries})`);
                    await new Promise(r => setTimeout(r, backoff));
                    continue;
                }

                throw new Error(err.message || `API Error: ${res.status}`);
            }

            return res.json();
        } catch (error: any) {
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
