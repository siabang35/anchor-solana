import DOMPurify from 'dompurify';

/**
 * Sanitize HTML content to prevent XSS attacks.
 * Uses DOMPurify to strip dangerous tags and attributes.
 */
export function sanitizeHtml(content: string): string {
    return DOMPurify.sanitize(content, {
        ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'li', 'ol'],
        ALLOWED_ATTR: ['href', 'target', 'rel'],
    });
}

/**
 * Sanitize plain text input.
 * Strictly removes any HTML-like tags.
 */
export function sanitizeText(text: string): string {
    if (typeof text !== 'string') return text;
    return text.replace(/<[^>]*>/g, '').trim();
}

/**
 * Generate a device fingerprint for anti-fraud purposes.
 * Collects non-invasive browser signals.
 */
export async function getDeviceFingerprint(): Promise<string> {
    const signals = [
        navigator.userAgent,
        navigator.language,
        new Date().getTimezoneOffset(),
        screen.width + 'x' + screen.height,
        (navigator as any).deviceMemory,
        (navigator as any).hardwareConcurrency,
    ];

    const fingerprintString = signals.join('|');

    // Simple hash (for demo purposes - production should use a library like fingerprintjs)
    let hash = 0;
    for (let i = 0; i < fingerprintString.length; i++) {
        const char = fingerprintString.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32bit integer
    }

    return Math.abs(hash).toString(16);
}

/**
 * Check if the current environment is secure (HTTPS or localhost)
 */
export function isSecureContext(): boolean {
    return (
        window.location.protocol === 'https:' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'
    );
}

/**
 * CSP Checking Helper
 * Logs a warning if CSP meta tag is missing (Development aid)
 */
export function checkCSP() {
    if (import.meta.env.DEV) {
        const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
        if (!csp) {
            console.warn('Security Warning: No Content-Security-Policy meta tag found.');
        }
    }
}
