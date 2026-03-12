import { useState, useEffect, useCallback } from 'react';
import api, { Notification } from '../../services/api';
import { useAuth } from '../components/auth/AuthContext';

export function useNotifications() {
    const { isAuthenticated } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchNotifications = useCallback(async () => {
        if (!isAuthenticated) return;

        setIsLoading(true);
        try {
            const [response, countData] = await Promise.all([
                api.notifications.getAll(),
                api.notifications.getUnreadCount()
            ]);
            // The API returns { data: Notification[], total: number }
            // @ts-ignore - The api type definition might need update but this fixes the runtime error
            setNotifications(response.data || []);
            setUnreadCount(countData.count);
            setError(null);
        } catch (err) {
            console.error('Failed to fetch notifications:', err);
            setError('Failed to load notifications');
        } finally {
            setIsLoading(false);
        }
    }, [isAuthenticated]);

    const markAsRead = useCallback(async (id: string) => {
        try {
            await api.notifications.markAsRead(id);

            // Optimistic update
            setNotifications(prev => prev.map(n =>
                n.id === id ? { ...n, is_read: true } : n
            ));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (err) {
            console.error('Failed to mark notification as read:', err);
        }
    }, []);

    const markAllAsRead = useCallback(async () => {
        try {
            await api.notifications.markAllAsRead();

            // Optimistic update
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            setUnreadCount(0);
        } catch (err) {
            console.error('Failed to mark all notifications as read:', err);
        }
    }, []);

    useEffect(() => {
        fetchNotifications();

        // Poll for new notifications every 30 seconds
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
    }, [fetchNotifications]);

    return {
        notifications,
        unreadCount,
        isLoading,
        error,
        refresh: fetchNotifications,
        markAsRead,
        markAllAsRead
    };
}
