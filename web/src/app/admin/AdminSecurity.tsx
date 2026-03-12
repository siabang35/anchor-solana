import { useEffect, useState } from 'react';
import {
    adminApi,
    SuspiciousActivity,
    SystemAlert,
    TrafficStats,
    SecurityConfig
} from '../../services/adminApi';
import {
    ShieldAlert,
    AlertOctagon,
    CheckCircle,
    Activity,
    RefreshCw,
    Globe,
    Zap,
    Cpu,
    Server,
    Wifi,
    Settings,
    Save
} from 'lucide-react';
import { toast } from '../components/shared/ToastProvider';
import { ResponsiveTable } from '../components/shared/ResponsiveTable';
import { SkeletonTable } from '../components/shared/SkeletonLoader';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';

export function AdminSecurity() {
    const [alerts, setAlerts] = useState<SystemAlert[]>([]);
    const [suspicious, setSuspicious] = useState<SuspiciousActivity[]>([]);
    const [traffic, setTraffic] = useState<TrafficStats | null>(null);
    const [config, setConfig] = useState<SecurityConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [trafficHistory, setTrafficHistory] = useState<any[]>([]);

    // Config Editing State
    const [editingConfig, setEditingConfig] = useState<Record<string, any>>({});
    const [confirmAction, setConfirmAction] = useState<{
        type: 'block_ip' | 'resolve_alert' | 'save_config';
        data: any;
        isOpen: boolean;
    } | null>(null);

    const fetchData = async () => {
        try {
            const [alertsData, suspiciousData, trafficData, configData] = await Promise.all([
                adminApi.getSystemAlerts('open'),
                adminApi.getSuspiciousActivity(),
                adminApi.getTrafficStats(),
                adminApi.getSecurityConfig()
            ]);

            setAlerts(alertsData);
            setSuspicious(suspiciousData);
            setTraffic(trafficData);
            setConfig(configData);

            // Update traffic history for chart
            if (trafficData) {
                setTrafficHistory(prev => {
                    const newPoint = {
                        time: new Date().toLocaleTimeString(),
                        requests: trafficData.requestsPerSecond,
                        latency: trafficData.avgLatencyMs,
                        errors: trafficData.errorRate * 100
                    };
                    return [...prev.slice(-20), newPoint]; // Keep last 20 points
                });
            }

        } catch (error) {
            console.error('Failed to fetch security data', error);
            // toast.error('Failed to load security data'); // Suppress to avoid spam on polling
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();

        // Connect to Real-time Security Gateway
        const socket = adminApi.getSecuritySocket();

        socket.on('connect', () => {
            console.log('Connected to Security Gateway');
        });

        socket.on('traffic_update', (stats: TrafficStats) => {
            setTraffic(stats);
            setTrafficHistory(prev => {
                const newPoint = {
                    time: new Date(stats.sampleTime || Date.now()).toLocaleTimeString(),
                    requests: stats.requestsPerSecond,
                    latency: stats.avgLatencyMs,
                    errors: stats.errorRate * 100
                };
                return [...prev.slice(-50), newPoint]; // Keep last 50 points for smoother high-res chart
            });
        });

        socket.on('threat_detected', (threat: SuspiciousActivity) => {
            toast.error(`THREAT DETECTED: ${threat.type} from ${threat.ipAddress}`);
            setSuspicious(prev => [threat, ...prev].slice(0, 20)); // Prepend new threat
        });

        socket.on('system_status', (_status: any) => {
            // specific logic if needed, e.g. online user count
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    const handleAction = async () => {
        if (!confirmAction) return;
        const { type, data } = confirmAction;

        try {
            if (type === 'resolve_alert') {
                await adminApi.updateAlertStatus(data.id, 'resolved', 'Resolved via Admin UI');
                toast.success('Alert resolved');
                setAlerts(alerts.filter(a => a.id !== data.id));
            } else if (type === 'block_ip') {
                await adminApi.blockIp(data.ipAddress, 'Manual block from Admin UI');
                toast.success(`IP ${data.ipAddress} blocked`);
            } else if (type === 'save_config') {
                await adminApi.updateSecurityConfig(data.key, data.value);
                toast.success('Configuration saved');
                setConfig(prev => prev.map(c => c.key === data.key ? { ...c, value: data.value } : c));
                setEditingConfig(prev => {
                    const next = { ...prev };
                    delete next[data.key];
                    return next;
                });
            }
        } catch (error: any) {
            toast.error(error.message || 'Action failed');
        } finally {
            setConfirmAction(null);
        }
    };

    const handleConfigChange = (key: string, value: any) => {
        setEditingConfig(prev => ({ ...prev, [key]: value }));
    };

    const activityColumns = [
        {
            key: 'type',
            header: 'Threat Type',
            render: (item: SuspiciousActivity) => (
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <span className="absolute inset-0 bg-red-500/20 blur-md rounded-full"></span>
                        <span className="relative bg-neutral-950 p-1.5 rounded-lg text-red-500 border border-red-500/30 flex shadow-[0_0_10px_rgba(239,68,68,0.2)]">
                            <AlertOctagon size={16} />
                        </span>
                    </div>
                    <div>
                        <span className="font-mono text-sm text-red-400 font-semibold tracking-wide text-glow-sm block" style={{ color: '#f87171' }}>{item.type || item.action || 'Unknown'}</span>
                        <span className="text-[10px] text-neutral-500">{item.description}</span>
                    </div>
                </div>
            )
        },
        {
            key: 'ip',
            header: 'Origin',
            render: (item: SuspiciousActivity) => (
                <div className="flex items-center gap-2 text-neutral-300 text-xs font-mono bg-neutral-900/50 px-2 py-1 rounded border border-neutral-800">
                    <Globe size={12} className="text-blue-400" />
                    {item.ipAddress}
                </div>
            )
        },
        {
            key: 'riskScore',
            header: 'Risk Level',
            align: 'center' as const,
            render: (item: SuspiciousActivity) => {
                const score = item.riskScore || 0;
                return (
                    <div className="flex flex-col items-center gap-1">
                        <div className="h-1.5 w-16 bg-neutral-800 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full ${score > 80 ? 'bg-red-500 animate-pulse' : 'bg-orange-500'}`}
                                style={{ width: `${score}%` }}
                            />
                        </div>
                        <span className={`text-[10px] font-bold ${score > 80 ? 'text-red-500' : 'text-orange-500'}`}>{score}/100</span>
                    </div>
                );
            }
        },
        {
            key: 'createdAt',
            header: 'Timestamp',
            render: (item: SuspiciousActivity) => <span className="text-neutral-500 text-xs font-mono">{new Date(item.createdAt).toLocaleTimeString()}</span>
        }
    ];

    const alertColumns = [
        {
            key: 'severity',
            header: 'Severity',
            render: (alert: SystemAlert) => (
                <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border backdrop-blur-sm ${alert.severity === 'critical' ? 'bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]' :
                    alert.severity === 'warning' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    }`}>
                    {alert.severity}
                </span>
            )
        },
        {
            key: 'title',
            header: 'Alert Details',
            render: (alert: SystemAlert) => (
                <div>
                    <div className="font-semibold text-white text-sm">{alert.title}</div>
                    <div className="text-xs text-neutral-500 truncate max-w-[200px] mt-0.5">{alert.description}</div>
                </div>
            )
        },
        { key: 'createdAt', header: 'Time', render: (alert: SystemAlert) => <span className="text-neutral-500 text-xs font-mono">{new Date(alert.createdAt).toLocaleString()}</span> }
    ];

    return (
        <div className="space-y-8 animate-in fade-in duration-700">

            {/* Premium Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative">
                <div className="absolute -top-10 -left-10 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
                <div className="absolute top-10 right-10 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>

                <div className="relative z-10 w-full flex justify-between items-center">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                                <ShieldAlert className="text-blue-400" size={24} />
                            </div>
                            <h1 className="text-3xl font-bold tracking-tight text-white/90">Security Command Center</h1>
                        </div>
                        <p className="text-neutral-400 max-w-lg pl-14">Real-time threat monitoring, intrusion detection, and automated system defense protocols.</p>
                    </div>

                    <div className="flex gap-3 relative z-10">
                        <button
                            onClick={fetchData}
                            className="p-2.5 glass-card rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-all border-glow"
                            title="Force Refresh"
                        >
                            <RefreshCw size={20} className={loading ? "animate-spin text-blue-400" : ""} />
                        </button>
                    </div>
                </div>
            </div>

            {/* System Status Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatusCard
                    icon={<Zap size={20} className="text-yellow-400" />}
                    label="System Status"
                    value={alerts.filter(a => a.severity === 'critical').length > 0 ? "Critical" : "Operational"}
                    status={alerts.filter(a => a.severity === 'critical').length > 0 ? "critical" : "good"}
                    subtext={`${config.find(c => c.key === 'maintenance_mode')?.value ? 'MAINTENANCE MODE' : 'Online'}`}
                />
                <StatusCard
                    icon={<Wifi size={20} className="text-blue-400" />}
                    label="Network Traffic"
                    value={traffic ? `${traffic.requestsPerSecond} req/s` : "..."}
                    status={traffic && traffic.requestsPerSecond > 1000 ? "warning" : "good"}
                    subtext={`${traffic?.avgLatencyMs || 0}ms latency avg`}
                />
                <StatusCard
                    icon={<Server size={20} className="text-purple-400" />}
                    label="Active Nodes"
                    value="8/8 Online"
                    status="good"
                    subtext="All systems nominal"
                />
                <StatusCard
                    icon={<Cpu size={20} className="text-red-400" />}
                    label="Threat Level"
                    value={suspicious.length > 5 ? "ELEVATED" : "LOW"}
                    status={suspicious.length > 5 ? "warning" : "good"}
                    subtext={`${suspicious.length} active threats`}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Traffic Monitor Chart */}
                <div className="lg:col-span-2 glass-panel rounded-2xl p-6 relative overflow-hidden">
                    <h2 className="font-semibold text-lg flex items-center gap-3 text-white mb-6">
                        <Activity size={20} className="text-blue-500" />
                        Real-time Traffic Monitor
                    </h2>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trafficHistory}>
                                <defs>
                                    <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                                <XAxis dataKey="time" stroke="#525252" tick={{ fontSize: 10 }} />
                                <YAxis yAxisId="left" stroke="#3b82f6" tick={{ fontSize: 10 }} />
                                <YAxis yAxisId="right" orientation="right" stroke="#ec4899" tick={{ fontSize: 10 }} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#000000cc', borderColor: '#333' }}
                                    itemStyle={{ fontSize: '12px' }}
                                />
                                <Area yAxisId="left" type="monotone" dataKey="requests" stroke="#3b82f6" fillOpacity={1} fill="url(#colorRequests)" name="Requests/s" />
                                <Area yAxisId="right" type="monotone" dataKey="latency" stroke="#ec4899" fillOpacity={1} fill="url(#colorLatency)" name="Latency (ms)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Security Configuration */}
                <div className="glass-panel rounded-2xl p-6">
                    <h2 className="font-semibold text-lg flex items-center gap-3 text-white mb-6">
                        <Settings size={20} className="text-neutral-400" />
                        Security Config
                    </h2>
                    <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {config.map((item) => (
                            <div key={item.key} className="p-3 bg-white/5 rounded-lg border border-white/5">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm font-medium text-neutral-300">{item.key.replace(/_/g, ' ')}</span>
                                    {editingConfig[item.key] !== undefined && (
                                        <button
                                            onClick={() => setConfirmAction({ type: 'save_config', data: { key: item.key, value: editingConfig[item.key] }, isOpen: true })}
                                            className="text-green-400 hover:text-green-300 transition-colors"
                                        >
                                            <Save size={14} />
                                        </button>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    {typeof item.value === 'boolean' ? (
                                        <div className="flex items-center gap-2">
                                            <button
                                                className={`w-10 h-5 rounded-full relative transition-colors ${editingConfig[item.key] ?? item.value ? 'bg-blue-600' : 'bg-neutral-700'}`}
                                                onClick={() => handleConfigChange(item.key, !(editingConfig[item.key] ?? item.value))}
                                            >
                                                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${editingConfig[item.key] ?? item.value ? 'left-5.5' : 'left-0.5'}`} />
                                            </button>
                                            <span className="text-xs text-neutral-500">{editingConfig[item.key] ?? item.value ? 'Enabled' : 'Disabled'}</span>
                                        </div>
                                    ) : (
                                        <textarea
                                            className="w-full bg-neutral-950/50 border border-neutral-800 rounded p-2 text-xs font-mono text-neutral-300 focus:border-blue-500 outline-none"
                                            value={JSON.stringify(editingConfig[item.key] ?? item.value, null, 2)}
                                            onChange={(e) => {
                                                try {
                                                    const val = JSON.parse(e.target.value);
                                                    handleConfigChange(item.key, val);
                                                } catch {
                                                    // Allow editing invalid JSON temporarily
                                                    // handleConfigChange(item.key, e.target.value); 
                                                }
                                            }}
                                            rows={3}
                                        />
                                    )}
                                    <p className="text-[10px] text-neutral-500">{item.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* Suspicious Activity Feed */}
                <div className="glass-panel rounded-2xl overflow-hidden min-h-[500px] flex flex-col relative w-full isolate">
                    <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between relative z-10 bg-neutral-950/40">
                        <h2 className="font-semibold text-lg flex items-center gap-3 text-white">
                            <Activity size={20} className="text-orange-500" />
                            Live Threat Feed
                        </h2>
                        {suspicious.length > 0 && (
                            <span className="flex items-center gap-2 text-xs bg-red-500/10 text-red-500 px-3 py-1.5 rounded-full font-bold border border-red-500/20 animate-pulse">
                                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                                {suspicious.length} DETECTED
                            </span>
                        )}
                    </div>

                    <div className="flex-1 relative z-10">
                        {loading ? (
                            <div className="p-6"><SkeletonTable rows={5} /></div>
                        ) : (
                            <ResponsiveTable
                                data={suspicious}
                                columns={activityColumns}
                                keyField="id"
                                emptyMessage="System secure. No anomalies detected."
                                actions={(item) => (
                                    <button
                                        onClick={() => setConfirmAction({ type: 'block_ip', data: item, isOpen: true })}
                                        className="text-[10px] sm:text-xs font-bold bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 px-3 py-1.5 rounded transition-all hover:shadow-[0_0_10px_rgba(239,68,68,0.3)] uppercase tracking-wide"
                                        title="Block Intruding IP"
                                    >
                                        BLOCK IP
                                    </button>
                                )}
                            />
                        )}
                    </div>
                </div>

                {/* System Alerts */}
                <div className="glass-panel rounded-2xl overflow-hidden min-h-[500px] flex flex-col relative w-full">
                    <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between bg-neutral-950/40">
                        <h2 className="font-semibold text-lg flex items-center gap-3 text-white">
                            <ShieldAlert size={20} className="text-blue-500" />
                            System Alerts
                        </h2>
                    </div>
                    <div className="flex-1">
                        {loading ? (
                            <div className="p-6"><SkeletonTable rows={5} /></div>
                        ) : (
                            <ResponsiveTable
                                data={alerts}
                                columns={alertColumns}
                                keyField="id"
                                emptyMessage="All systems verified. No active alerts."
                                actions={(alert) => (
                                    <button
                                        onClick={() => setConfirmAction({ type: 'resolve_alert', data: alert, isOpen: true })}
                                        className="text-blue-400 hover:text-white p-1.5 hover:bg-blue-500/20 rounded-lg transition-colors"
                                        title="Mark Resolved"
                                    >
                                        <CheckCircle size={18} />
                                    </button>
                                )}
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* Confirm Dialog */}
            <ConfirmDialog
                isOpen={!!confirmAction?.isOpen}
                onClose={() => setConfirmAction(null)}
                onConfirm={handleAction}
                title={
                    confirmAction?.type === 'block_ip' ? 'Block IP Address?' :
                        confirmAction?.type === 'save_config' ? 'Update Configuration?' : 'Resolve Alert?'
                }
                description={
                    confirmAction?.type === 'block_ip' ? `Are you sure you want to block IP ${confirmAction?.data.ipAddress}?` :
                        confirmAction?.type === 'save_config' ? `Update ${confirmAction?.data.key} to new value?` :
                            `Mark "${confirmAction?.data.title}" as resolved?`
                }
                variant={confirmAction?.type === 'block_ip' ? 'danger' : 'info'}
                confirmText={confirmAction?.type === 'block_ip' ? 'Block IP' : confirmAction?.type === 'save_config' ? 'Save' : 'Resolve'}
            />

        </div>
    );
}

function StatusCard({ icon, label, value, status, subtext }: { icon: any, label: string, value: string, status: 'good' | 'warning' | 'critical', subtext: string }) {
    const statusColor = status === 'good' ? 'text-green-500' : status === 'warning' ? 'text-orange-500' : 'text-red-500';
    const bgGlow = status === 'good' ? 'bg-green-500/5' : status === 'warning' ? 'bg-orange-500/5' : 'bg-red-500/5';
    const borderGlow = status === 'good' ? 'border-green-500/10' : status === 'warning' ? 'border-orange-500/10' : 'border-red-500/10';

    return (
        <div className={`glass-card p-5 rounded-xl border ${borderGlow} ${bgGlow} flex items-start justify-between group`}>
            <div>
                <p className="text-neutral-400 text-xs font-medium uppercase tracking-wider mb-1 opacity-80">{label}</p>
                <h3 className="text-xl font-bold text-white mb-1 group-hover:text-glow-sm transition-all">{value}</h3>
                <p className={`text-[10px] ${statusColor} font-mono flex items-center gap-1.5`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${status === 'good' ? 'bg-green-500' : status === 'warning' ? 'bg-orange-500' : 'bg-red-500'}`}></span>
                    {subtext}
                </p>
            </div>
            <div className={`p-2.5 rounded-lg border ${borderGlow} bg-neutral-950/30`}>
                {icon}
            </div>
        </div>
    );
}
