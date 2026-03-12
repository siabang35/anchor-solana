/**
 * Application Configuration
 * 
 * Centralized configuration for API endpoints and environment settings.
 * Uses environment variables for production support.
 */

// Default API URLs for different environments
const DEFAULT_API_URL = 'http://localhost:3001/api/v1';
const DEFAULT_WS_URL = 'http://localhost:3001';

// Production API URL
const PRODUCTION_API_URL = 'https://backend-exoduze.onrender.com/api/v1';
const PRODUCTION_WS_URL = 'https://backend-exoduze.onrender.com';

/**
 * Get the API base URL
 * Priority: VITE_API_URL env var > production detection > localhost default
 */
export function getApiUrl(): string {
    // Check for explicit environment variable
    if (import.meta.env.VITE_API_URL) {
        return import.meta.env.VITE_API_URL;
    }

    // Auto-detect production environment (if hosted on known production domains)
    if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        // If running on production domain, use production API
        if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
            return PRODUCTION_API_URL;
        }
    }

    // Fallback to localhost for development
    return DEFAULT_API_URL;
}

/**
 * Get the WebSocket base URL
 * Priority: VITE_WS_URL or VITE_API_URL env var > production detection > localhost default
 */
export function getWsUrl(): string {
    // Check for explicit WebSocket URL
    if (import.meta.env.VITE_WS_URL) {
        return import.meta.env.VITE_WS_URL;
    }

    // Fall back to API URL (without /api/v1 path)
    if (import.meta.env.VITE_API_URL) {
        // Remove /api/v1 suffix if present
        return import.meta.env.VITE_API_URL.replace('/api/v1', '');
    }

    // Auto-detect production environment
    if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
            return PRODUCTION_WS_URL;
        }
    }

    // Fallback to localhost for development
    return DEFAULT_WS_URL;
}

// Export configuration object
export const config = {
    apiUrl: getApiUrl(),
    wsUrl: getWsUrl(),
    isProduction: import.meta.env.PROD,
    isDevelopment: import.meta.env.DEV,
} as const;

// Export individual URLs for convenience
export const API_URL = getApiUrl();
export const WS_URL = getWsUrl();

export default config;
