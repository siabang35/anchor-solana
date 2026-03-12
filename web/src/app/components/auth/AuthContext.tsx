import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { authApi, getAccessToken } from '../../../services/api';

// Types
export interface User {
    id: string;
    email?: string;
    emailVerified?: boolean;
    fullName?: string;
    avatarUrl?: string;
    bio?: string;
    walletAddresses?: Array<{ address: string; chain: string }>;
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;
    login: (email: string, password: string) => Promise<void>;
    signup: (email: string, password: string, fullName?: string) => Promise<void>;
    logout: () => Promise<void>;
    clearError: () => void;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider Props
interface AuthProviderProps {
    children: ReactNode;
}

/**
 * AuthProvider - Manages global authentication state
 */
export function AuthProvider({ children }: AuthProviderProps) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const isAuthenticated = user !== null;

    /**
     * Fetch current user from API
     */
    const refreshUser = useCallback(async () => {
        // Check if we have any auth credentials before making API call
        const token = getAccessToken();
        const hasRefreshToken = !!localStorage.getItem('exoduze_refresh_token');

        if (!token && !hasRefreshToken) {
            // No credentials at all, user is definitely logged out
            setUser(null);
            setIsLoading(false);
            return;
        }

        try {
            const userData = await authApi.me() as User;
            setUser(userData);
        } catch (error) {
            console.error('[AuthContext] Failed to refresh user:', error);
            // Only clear user if we actually lost the token (e.g. 401 handled by api.ts)
            if (!getAccessToken()) {
                setUser(null);
            }
            // Otherwise, keep the stale user data rather than logging out on a 500/Network error
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * Initialize auth state on mount
     */
    useEffect(() => {
        refreshUser();
    }, [refreshUser]);

    /**
     * Login with email and password
     */
    const login = useCallback(async (email: string, password: string) => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await authApi.login(email, password);
            setUser(response.user);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Login failed';
            setError(message);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * Signup with email and password
     */
    const signup = useCallback(async (email: string, password: string, fullName?: string) => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await authApi.signup(email, password, fullName);
            setUser(response.user);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Signup failed';
            setError(message);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * Logout and clear tokens
     */
    const logout = useCallback(async () => {
        setIsLoading(true);
        try {
            await authApi.logout();
        } finally {
            setUser(null);
            setIsLoading(false);
        }
    }, []);

    /**
     * Clear error message
     */
    const clearError = useCallback(() => {
        setError(null);
    }, []);

    const value: AuthContextType = {
        user,
        isAuthenticated,
        isLoading,
        error,
        login,
        signup,
        logout,
        clearError,
        refreshUser,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

/**
 * Hook to access auth context
 */
export function useAuth(): AuthContextType {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export default AuthContext;
