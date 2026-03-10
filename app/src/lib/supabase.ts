import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://meeyiimlnsboyhvvycaz.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

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
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

// Helper: fetch from backend API
export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE_URL}${path}`, {
        headers: {
            'Content-Type': 'application/json',
            ...(options?.headers || {}),
        },
        ...options,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || `API Error: ${res.status}`);
    }
    return res.json();
}
