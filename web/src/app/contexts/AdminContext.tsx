import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { adminApi } from '../../services/adminApi';
import { useAuth } from '../components/auth/AuthContext';
import { getAccessToken } from '../../services/api';

interface AdminContextType {
    isAdmin: boolean;
    adminProfile: any | null; // Placeholder for now
    isLoading: boolean;
    checkAdmin: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: ReactNode }) {
    const { isAuthenticated, isLoading: authLoading, user } = useAuth();
    const [isAdmin, setIsAdmin] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const checkInProgress = useRef(false);
    const retryCount = useRef(0);
    const maxRetries = 5;

    const checkAdmin = useCallback(async () => {
        // Prevent concurrent checks
        if (checkInProgress.current) {
            return;
        }

        // Wait for auth to finish loading before checking admin status
        if (authLoading) {
            return;
        }

        // Not authenticated - no need to check admin
        if (!isAuthenticated || !user) {
            setIsAdmin(false);
            setIsLoading(false);
            retryCount.current = 0;
            return;
        }

        // Check if we have a token - if not, wait and retry
        const token = getAccessToken();
        if (!token) {
            if (retryCount.current < maxRetries) {
                retryCount.current++;
                // Wait longer each retry (200ms, 400ms, 600ms, 800ms, 1000ms)
                setTimeout(() => {
                    checkAdmin();
                }, retryCount.current * 200);
                return;
            } else {
                // Max retries reached, give up
                setIsAdmin(false);
                setIsLoading(false);
                retryCount.current = 0;
                return;
            }
        }

        checkInProgress.current = true;
        retryCount.current = 0;

        try {
            setIsLoading(true);
            const isReallyAdmin = await adminApi.checkIsAdmin();
            setIsAdmin(isReallyAdmin);
        } catch {
            setIsAdmin(false);
        } finally {
            setIsLoading(false);
            checkInProgress.current = false;
        }
    }, [isAuthenticated, authLoading, user]);

    useEffect(() => {
        // Add small delay to ensure token is fully stored after login
        const timeoutId = setTimeout(() => {
            checkAdmin();
        }, 200);

        return () => clearTimeout(timeoutId);
    }, [checkAdmin]);

    return (
        <AdminContext.Provider value={{ isAdmin, adminProfile: null, isLoading, checkAdmin }}>
            {children}
        </AdminContext.Provider>
    );
}

export function useAdmin() {
    const context = useContext(AdminContext);
    if (!context) {
        throw new Error('useAdmin must be used within an AdminProvider');
    }
    return context;
}
