import { useState } from 'react';
import { useNotifications } from '../../hooks/useNotifications';
import { Bell, Check, Clock, AlertTriangle, Info, CreditCard, ChevronRight } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';

export function NotificationsPage() {
    const { notifications, isLoading, markAsRead, markAllAsRead } = useNotifications();
    const [filter, setFilter] = useState<'all' | 'unread'>('all');

    const filteredNotifications = notifications.filter(n => {
        if (filter === 'unread') return !n.is_read;
        return true;
    });

    const getIcon = (type: string) => {
        switch (type) {
            case 'deposit_confirmed':
            case 'deposit_pending':
            case 'withdrawal_initiated':
            case 'withdrawal_completed':
                return <CreditCard className="w-5 h-5 text-blue-500" />;
            case 'security_alert':
                return <AlertTriangle className="w-5 h-5 text-red-500" />;
            case 'welcome':
                return <Info className="w-5 h-5 text-green-500" />;
            default:
                return <Bell className="w-5 h-5 text-purple-500" />;
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold font-rajdhani tracking-wide">Notifications</h1>
                    <p className="text-muted-foreground mt-1">Stay updated with your activities</p>
                </div>

                <div className="flex items-center gap-2">
                    <div className="bg-secondary/50 p-1 rounded-lg flex space-x-1">
                        <button
                            onClick={() => setFilter('all')}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${filter === 'all'
                                ? 'bg-background shadow-sm text-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            All
                        </button>
                        <button
                            onClick={() => setFilter('unread')}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${filter === 'unread'
                                ? 'bg-background shadow-sm text-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            Unread
                        </button>
                    </div>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={markAllAsRead}
                        disabled={isLoading || notifications.every(n => n.is_read)}
                        className="hidden md:flex"
                    >
                        <Check className="w-4 h-4 mr-2" />
                        Mark all read
                    </Button>
                </div>
            </header>

            <div className="space-y-4">
                {isLoading && notifications.length === 0 ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-24 bg-card/50 rounded-xl animate-pulse" />
                        ))}
                    </div>
                ) : filteredNotifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                        <div className="w-16 h-16 bg-secondary/50 rounded-full flex items-center justify-center mb-4">
                            <Bell className="w-8 h-8 opacity-50" />
                        </div>
                        <h3 className="text-lg font-medium">No notifications</h3>
                        <p>You're all caught up!</p>
                    </div>
                ) : (
                    <AnimatePresence mode="popLayout">
                        {filteredNotifications.map((notification) => (
                            <motion.div
                                key={notification.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className={`relative group flex gap-4 p-4 rounded-xl border transition-all hover:bg-accent/50 ${notification.is_read
                                    ? 'bg-card/50 border-transparent'
                                    : 'bg-card border-l-4 border-l-primary shadow-sm'
                                    }`}
                                onClick={() => !notification.is_read && markAsRead(notification.id)}
                            >
                                <div className={`mt-1 flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${notification.is_read ? 'bg-secondary' : 'bg-primary/10'
                                    }`}>
                                    {getIcon(notification.type)}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start gap-2">
                                        <h3 className={`text-base font-semibold ${!notification.is_read && 'text-foreground'}`}>
                                            {notification.title}
                                        </h3>
                                        <span className="text-xs text-muted-foreground flex items-center whitespace-nowrap">
                                            <Clock className="w-3 h-3 mr-1" />
                                            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                                        </span>
                                    </div>

                                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                                        {notification.message}
                                    </p>

                                    {notification.action_url && (
                                        <Button variant="link" size="sm" className="h-auto p-0 mt-2 text-primary">
                                            View details <ChevronRight className="w-3 h-3 ml-1" />
                                        </Button>
                                    )}
                                </div>

                                {!notification.is_read && (
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                        <div className="w-2 h-2 bg-primary rounded-full" />
                                    </div>
                                )}
                            </motion.div>
                        ))}
                    </AnimatePresence>
                )}
            </div>
        </div>
    );
}
