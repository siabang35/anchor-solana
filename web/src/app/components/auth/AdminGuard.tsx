import React from 'react';
import { useAdmin } from '../../contexts/AdminContext';
import { useAuth } from './AuthContext';
import { Loader2 } from 'lucide-react';

interface AdminRouteProps {
    children: React.ReactNode;
}

export function AdminRoute({ children }: AdminRouteProps) {
    const { isAuthenticated, isLoading: authLoading } = useAuth();
    const { isAdmin, isLoading: adminLoading } = useAdmin();

    if (authLoading || adminLoading) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-neutral-950 text-white">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (!isAuthenticated || !isAdmin) {
        // Redirect to home or show denied message
        // For now, we'll return a 404/Denied style component
        return (
            <div className="h-screen w-full flex flex-col items-center justify-center bg-neutral-950 text-white p-4">
                <h1 className="text-4xl font-bold mb-4 text-red-500">Access Denied</h1>
                <p className="text-neutral-400 mb-8">You do not have permission to access the admin dashboard.</p>
                <a href="/" className="px-6 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                    Return Home
                </a>
            </div>
        );
    }

    return <>{children}</>;
}
