import { useEffect, useState } from 'react';
import { adminApi, DashboardStats, SystemAlert } from '../../services/adminApi';
import { Skeleton, SkeletonCard } from '../components/shared/SkeletonLoader';
import { toast } from '../components/shared/ToastProvider';
import {
    Users,
    DollarSign,
    Activity,
    AlertTriangle,
    ArrowUpRight,
    ArrowDownRight,
    Shield,
    Clock,
    RefreshCw
} from 'lucide-react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar
} from 'recharts';

// NOTE: Chart data is mocked as the current API only provides aggregate stats, not time-series data.
// In a future update, we should implement /admin/stats/history endpoint.
const MOCK_VOLUME_DATA = [
    { name: 'Mon', volume: 24000 },
    { name: 'Tue', volume: 13980 },
    { name: 'Wed', volume: 98000 },
    { name: 'Thu', volume: 39080 },
    { name: 'Fri', volume: 48000 },
    { name: 'Sat', volume: 38000 },
    { name: 'Sun', volume: 43000 },
];

const MOCK_USER_GROWTH_DATA = [
    { name: 'Mon', users: 400 },
    { name: 'Tue', users: 300 },
    { name: 'Wed', users: 550 },
    { name: 'Thu', users: 450 },
    { name: 'Fri', users: 600 },
    { name: 'Sat', users: 750 },
    { name: 'Sun', users: 850 },
];

export function AdminOverview() {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [alerts, setAlerts] = useState<SystemAlert[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [userGrowthData, setUserGrowthData] = useState<any[]>([]);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            // Fetch stats, alerts, AND recent users for the growth chart
            const [statsData, alertsData, usersResponse] = await Promise.all([
                adminApi.getStats(),
                adminApi.getSystemAlerts('open'),
                adminApi.getUsers('', 1, 100) // Fetch last 100 users to calculate growth trend
            ]);

            setStats(statsData);
            setAlerts(alertsData);

            // Process users to generate "Growth" chart (Users created per day)
            const users = usersResponse.data;
            const daysMap = new Map<string, number>();

            // Initialize last 7 days with 0
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
                daysMap.set(dayName, 0);
            }

            // Group by day 
            users.forEach(u => {
                const d = new Date(u.createdAt);
                const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
                if (daysMap.has(dayName)) {
                    daysMap.set(dayName, (daysMap.get(dayName) || 0) + 1);
                }
            });

            // Convert to array
            const realGrowthData = Array.from(daysMap.entries()).map(([name, users]) => ({ name, users }));
            setUserGrowthData(realGrowthData);

        } catch (err: any) {
            console.error('Failed to fetch admin data', err);
            setError(err.message || 'Failed to load dashboard data');
            toast.error('Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();

        // Real-time Socket Updates
        const socket = adminApi.getSecuritySocket();

        socket.on('connect', () => {
            console.log('Connected to Dashboard Stream');
        });

        // Listen for new user events (if available) or just periodic stats refresh
        // For now, we can poll stats or listen to generic system_status
        socket.on('system_status', (data: any) => {
            if (data?.stats) {
                setStats(prev => ({ ...prev, ...data.stats }));
            }
        });

        const interval = setInterval(() => {
            // Poll critical stats slightly more often if socket isn't pushing everything
            adminApi.getStats().then(setStats).catch(() => { });
        }, 15000);

        return () => {
            socket.disconnect();
            clearInterval(interval);
        };
    }, []);

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-96 space-y-4">
                <AlertTriangle size={48} className="text-red-500 opacity-50" />
                <h3 className="text-lg font-medium text-white">Something went wrong</h3>
                <p className="text-neutral-500">{error}</p>
                <button
                    onClick={fetchData}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                    <RefreshCw size={16} />
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Dashboard Overview</h1>
                    <p className="text-neutral-400">Real-time platform insights and critical alerts.</p>
                </div>
                <div className="flex items-center gap-2 text-sm text-neutral-500 bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-full">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                    System Operational
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <SkeletonCard key={i} className="h-32 p-4" /> // Simplified skeleton for card
                    ))
                ) : (
                    <>
                        <StatsCard
                            title="Total Users"
                            value={stats?.totalUsers.toLocaleString() ?? '0'}
                            change={`+${stats?.newUsersWeek ?? 0} this week`}
                            isPositive={true}
                            icon={Users}
                            color="blue"
                        />
                        <StatsCard
                            title="Total Value Locked"
                            value={`$${(stats?.totalTvl ?? 0).toLocaleString()}`}
                            change="+5.2%"
                            isPositive={true}
                            icon={DollarSign}
                            color="green"
                        />
                        <StatsCard
                            title="Total Volume"
                            value={`$${(stats?.totalVolume ?? 0).toLocaleString()}`}
                            change="+2.1%"
                            isPositive={true}
                            icon={Activity}
                            color="purple"
                        />
                        <StatsCard
                            title="Pending Withdrawals"
                            value={stats?.pendingWithdrawals.toString() ?? '0'}
                            change={stats && stats.pendingWithdrawals > 5 ? "Action Needed" : "Normal"}
                            isPositive={!(stats && stats.pendingWithdrawals > 5)}
                            icon={Clock}
                            color="orange"
                            highlight={stats && stats.pendingWithdrawals > 5}
                        />
                    </>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Charts Section */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Main Chart */}
                    <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-semibold text-lg">Transaction Volume</h3>
                            <div className="text-xs text-neutral-500 bg-neutral-900 border border-neutral-800 px-2 py-1 rounded">
                                Last 7 Days (Projected)
                            </div>
                        </div>
                        <div className="h-[300px] w-full" role="img" aria-label="Transaction Volume Chart">
                            {loading ? (
                                <Skeleton variant="chart" height="100%" width="100%" />
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={MOCK_VOLUME_DATA}>
                                        <defs>
                                            <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                                        <XAxis dataKey="name" stroke="#525252" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                                        <YAxis stroke="#525252" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value / 1000}k`} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '8px' }}
                                            itemStyle={{ color: '#fff' }}
                                        />
                                        <Area type="monotone" dataKey="volume" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorVolume)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>

                    {/* Secondary Chart */}
                    <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6">
                        <div className="mb-6 flex justify-between items-center">
                            <h3 className="font-semibold text-lg">User Growth</h3>
                            <span className="text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded border border-green-500/20 animate-pulse">
                                Live Data
                            </span>
                        </div>
                        <div className="h-[250px] w-full" role="img" aria-label="User Growth Chart">
                            {loading ? (
                                <Skeleton variant="chart" height="100%" width="100%" />
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={userGrowthData.length > 0 ? userGrowthData : MOCK_USER_GROWTH_DATA}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                                        <XAxis dataKey="name" stroke="#525252" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                                        <Tooltip
                                            cursor={{ fill: '#262626' }}
                                            contentStyle={{ backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '8px' }}
                                        />
                                        <Bar dataKey="users" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Alerts & Activity */}
                <div className="space-y-6">
                    {/* System Alerts */}
                    <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 h-full">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-lg flex items-center gap-2">
                                <Shield size={18} className="text-red-500" />
                                Critical Alerts
                            </h3>
                            <span className="bg-red-500/10 text-red-500 text-xs font-bold px-2 py-1 rounded-full">
                                {loading ? <Skeleton width={20} height={16} /> : `${alerts.length} Open`}
                            </span>
                        </div>

                        <div className="space-y-4">
                            {loading ? (
                                <div className="space-y-3">
                                    <Skeleton height={80} className="w-full" />
                                    <Skeleton height={80} className="w-full" />
                                    <Skeleton height={80} className="w-full" />
                                </div>
                            ) : alerts.length === 0 ? (
                                <div className="text-center py-12 text-neutral-500 border border-dashed border-neutral-800 rounded-xl">
                                    <Shield size={32} className="mx-auto mb-2 opacity-20" />
                                    No active alerts
                                </div>
                            ) : (
                                alerts.map((alert) => (
                                    <div key={alert.id} className={`p-4 rounded-xl border ${alert.severity === 'critical' ? 'bg-red-500/5 border-red-500/20' :
                                        alert.severity === 'warning' ? 'bg-orange-500/5 border-orange-500/20' :
                                            'bg-neutral-900 border-neutral-800'
                                        }`}>
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-2 mb-1">
                                                {alert.severity === 'critical' && <AlertTriangle size={14} className="text-red-500" />}
                                                <h4 className={`font-medium text-sm ${alert.severity === 'critical' ? 'text-red-400' :
                                                    alert.severity === 'warning' ? 'text-orange-400' : 'text-white'
                                                    }`}>{alert.title}</h4>
                                            </div>
                                            <span className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">{alert.severity}</span>
                                        </div>
                                        <p className="text-xs text-neutral-400 bg-black/20 p-2 rounded mt-2">{alert.description}</p>
                                        <div className="mt-3 flex items-center justify-between">
                                            <span className="text-[10px] text-neutral-600">
                                                {new Date(alert.createdAt).toLocaleTimeString()}
                                            </span>
                                            <button className="text-[10px] bg-neutral-800 hover:bg-neutral-700 px-2 py-1 rounded transition-colors">
                                                Verify
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Sub-component for Stats Card
function StatsCard({ title, value, change, isPositive, icon: Icon, color, highlight }: any) {
    const colorMap: any = {
        blue: "text-blue-500 bg-blue-500/10",
        green: "text-green-500 bg-green-500/10",
        purple: "text-purple-500 bg-purple-500/10",
        orange: "text-orange-500 bg-orange-500/10",
    };

    return (
        <div className={`bg-neutral-950 border rounded-2xl p-5 transition-all group ${highlight ? 'border-orange-500/50 shadow-[0_0_20px_rgba(249,115,22,0.1)]' : 'border-neutral-800 hover:border-neutral-700'}`}>
            <div className="flex items-start justify-between mb-4">
                <div>
                    <p className="text-sm font-medium text-neutral-400">{title}</p>
                    <h3 className="text-2xl font-bold mt-1 text-white">{value}</h3>
                </div>
                <div className={`p-2 rounded-xl ${colorMap[color]}`}>
                    <Icon size={20} />
                </div>
            </div>
            <div className="flex items-center gap-2">
                <span className={`flex items-center text-xs font-bold px-1.5 py-0.5 rounded ${isPositive ? "text-green-400 bg-green-400/10" : "text-red-400 bg-red-400/10"
                    }`}>
                    {isPositive ? <ArrowUpRight size={12} className="mr-1" /> : <ArrowDownRight size={12} className="mr-1" />}
                    {change}
                </span>
                <span className="text-xs text-neutral-500">vs last period</span>
            </div>
        </div>
    );
}
