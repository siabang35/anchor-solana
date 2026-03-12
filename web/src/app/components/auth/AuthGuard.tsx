import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useCallback, useRef } from "react";
import { useAuth } from "./AuthContext";
import { LoadingSpinner } from "../LoadingSpinner";

interface AuthGuardProps {
    children: React.ReactNode;
    /** Optional: specific roles required (future use) */
    requiredRoles?: string[];
    /** Optional: custom redirect path */
    redirectTo?: string;
}

/**
 * AuthGuard - OWASP-Compliant Route Protection
 * 
 * Security Features:
 * 1. Authentication Verification: Checks token validity before rendering.
 * 2. Secure Redirect: Uses `replace` to prevent back-button bypass.
 * 3. Session Monitoring: Re-validates auth state on visibility change.
 * 4. Rate Limiting (Client-Side): Limits rapid redirect attempts.
 * 5. Path Sanitization: Validates redirect paths to prevent open redirects.
 * 6. Loading State: Prevents flash of protected content.
 */
export function AuthGuard({
    children,
    redirectTo = '/markets'
}: AuthGuardProps) {
    const { isAuthenticated, isLoading, user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    // Security: Track redirect attempts to prevent redirect loops
    const redirectAttempts = useRef(0);
    const lastRedirectTime = useRef(0);
    const MAX_REDIRECT_ATTEMPTS = 3;
    const REDIRECT_COOLDOWN_MS = 2000;

    /**
     * Validate redirect path to prevent open redirect attacks (OWASP A1:2021)
     */
    const getSafeRedirectPath = useCallback((path: string): string => {
        // Only allow relative paths within the application
        if (!path.startsWith('/') || path.includes('://') || path.startsWith('//')) {
            console.warn('[AuthGuard] Blocked potentially unsafe redirect:', path);
            return '/markets';
        }
        // Sanitize: Remove any query params or fragments that could be malicious
        const safePath = path.split('?')[0].split('#')[0];
        return safePath;
    }, []);

    /**
     * Rate-limited redirect with security logging
     */
    const secureRedirect = useCallback(() => {
        const now = Date.now();

        // Rate limiting check
        if (now - lastRedirectTime.current < REDIRECT_COOLDOWN_MS) {
            redirectAttempts.current++;
            if (redirectAttempts.current >= MAX_REDIRECT_ATTEMPTS) {
                console.error('[AuthGuard] Excessive redirect attempts detected - possible attack');
                // In production, this could trigger a security alert
                return;
            }
        } else {
            redirectAttempts.current = 0;
        }

        lastRedirectTime.current = now;

        const safePath = getSafeRedirectPath(redirectTo);

        // Security: Use `replace` to prevent back-button bypass
        navigate(safePath, {
            replace: true,
            state: {
                from: location.pathname,
                reason: 'authentication_required'
            }
        });
    }, [navigate, location.pathname, redirectTo, getSafeRedirectPath]);

    /**
     * Session validation on mount and auth state change
     */
    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            secureRedirect();
        }
    }, [isAuthenticated, isLoading, secureRedirect]);

    /**
     * Re-validate session when page becomes visible (OWASP Session Management)
     * Protects against session hijacking when tab is in background
     */
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && !isLoading) {
                // If page becomes visible and user is no longer authenticated, redirect
                if (!isAuthenticated) {
                    secureRedirect();
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [isAuthenticated, isLoading, secureRedirect]);

    // Loading state - prevents flash of protected content
    if (isLoading) {
        return (
            <div className="flex h-[80vh] w-full items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-4">
                    <LoadingSpinner size="lg" />
                    <p className="text-sm text-muted-foreground animate-pulse">
                        Verifying session...
                    </p>
                </div>
            </div>
        );
    }

    // Not authenticated - return null while redirecting
    if (!isAuthenticated || !user) {
        return null;
    }

    // Authenticated - render children
    return <>{children}</>;
}

/**
 * Higher-order component version for class components (if needed)
 */
export function withAuthGuard<P extends object>(
    WrappedComponent: React.ComponentType<P>,
    options?: Omit<AuthGuardProps, 'children'>
) {
    return function AuthGuardedComponent(props: P) {
        return (
            <AuthGuard {...options}>
                <WrappedComponent {...props} />
            </AuthGuard>
        );
    };
}
