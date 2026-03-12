import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
} from 'recharts';
import type { ProbabilitySnapshot } from '../../../hooks/useOnChainMarket';
import type { Competition } from '../../../hooks/useCompetitions';

interface Props {
    competition?: Competition | null;
    probHistory?: ProbabilitySnapshot[];
}

function getHorizon(competition: Competition | null | undefined): string {
    if (!competition) return '';
    const start = new Date(competition.competition_start).getTime();
    const end = new Date(competition.competition_end).getTime();
    const hours = (end - start) / (1000 * 60 * 60);
    if (hours <= 2) return '2H';
    if (hours <= 7) return '7H';
    if (hours <= 12) return '12H';
    if (hours <= 24) return '24H';
    if (hours <= 72) return '3D';
    return '7D';
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-xl border border-border/50 bg-background/95 backdrop-blur-xl p-3 shadow-2xl min-w-[180px]">
            <p className="text-xs text-muted-foreground mb-2 font-mono">⏱ Time: {label}</p>
            {payload.map((entry: any, index: number) => (
                <div key={index} className="flex items-center justify-between gap-3 text-sm py-0.5">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
                        <span className="text-muted-foreground text-xs">{entry.name}</span>
                    </div>
                    <span className="font-mono font-bold text-xs" style={{ color: entry.color }}>
                        {entry.value.toFixed(1)}%
                    </span>
                </div>
            ))}
        </div>
    );
};

export function ProbabilityCurve({ competition, probHistory }: Props) {
    const data = probHistory && probHistory.length > 0 ? probHistory : [];
    const horizon = getHorizon(competition);
    const isLive = competition?.status === 'active';

    const outcomes = competition?.outcomes || ['Home Win', 'Draw', 'Away Win'];
    const title = competition?.title || 'Live Market';
    const sector = competition?.sector || 'Market';
    const teamHome = competition?.team_home;
    const teamAway = competition?.team_away;

    const { latest, deltas } = useMemo(() => {
        if (data.length === 0) return { latest: null, deltas: { home: 0, draw: 0, away: 0 } };
        const l = data[data.length - 1];
        const prev = data.length > 2 ? data[data.length - 3] : l;
        return {
            latest: l,
            deltas: {
                home: l.home - prev.home,
                draw: l.draw - prev.draw,
                away: l.away - prev.away,
            },
        };
    }, [data]);

    const deltaIcon = (d: number) => d > 0.3 ? '▲' : d < -0.3 ? '▼' : '—';
    const deltaColor = (d: number) => d > 0.3 ? 'text-emerald-400' : d < -0.3 ? 'text-red-400' : 'text-muted-foreground';

    if (data.length === 0) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-md p-6"
            >
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <span className="text-xl">📊</span> Live Probability Curve
                    </h3>
                    {competition && (
                        <div className="flex items-center gap-2">
                            {horizon && (
                                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400">
                                    {horizon}
                                </span>
                            )}
                            {isLive && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 animate-pulse">
                                    ● LIVE
                                </span>
                            )}
                        </div>
                    )}
                </div>
                {competition && (
                    <p className="text-sm text-muted-foreground mb-2 font-semibold">{competition.title}</p>
                )}
                <div className="text-center py-12 text-muted-foreground text-sm">
                    Waiting for competition data...
                </div>
            </motion.div>
        );
    }

    const probBadges = [
        { label: outcomes[0] || '🏠 Home', value: latest!.home, delta: deltas.home, color: '#818cf8', bgClass: 'bg-indigo-500/10 border-indigo-500/20' },
        { label: outcomes[1] || '🤝 Draw', value: latest!.draw, delta: deltas.draw, color: '#f59e0b', bgClass: 'bg-amber-500/10 border-amber-500/20' },
        { label: outcomes[2] || '✈️ Away', value: latest!.away, delta: deltas.away, color: '#ef4444', bgClass: 'bg-red-500/10 border-red-500/20' },
    ];

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-md p-5 md:p-6"
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold flex items-center gap-2">
                    <span className="text-xl">📊</span> Live Probability Curve
                </h3>
                <div className="flex items-center gap-2">
                    {horizon && (
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400">
                            {horizon}
                        </span>
                    )}
                    {isLive && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 animate-pulse">
                            ● LIVE
                        </span>
                    )}
                    <span className="text-[10px] text-muted-foreground font-mono">
                        {competition?.onchain_market_pubkey ? 'On-Chain' : 'Realtime'}
                    </span>
                </div>
            </div>

            {/* Title */}
            <div className="text-center mb-4">
                <div className="text-xl font-extrabold tracking-tight">
                    {teamHome && teamAway ? `${teamHome} vs ${teamAway}` : title}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                    {sector.charAt(0).toUpperCase() + sector.slice(1)} · {competition?.status === 'active' ? '● Live' : competition?.status === 'settled' ? '✓ Ended' : 'Upcoming'} · Realtime Analysis
                </p>
            </div>

            {/* Probability Badges */}
            <div className="flex justify-center gap-2 md:gap-3 mb-5 flex-wrap">
                {probBadges.map((item) => (
                    <div
                        key={item.label}
                        className={`flex items-center gap-2 px-3 py-2 rounded-full border font-mono text-sm font-bold ${item.bgClass}`}
                        style={{ color: item.color }}
                    >
                        <span className="text-xs">{item.label}</span>
                        <span>{item.value.toFixed(1)}%</span>
                        <span className={`text-[9px] font-extrabold ${deltaColor(item.delta)}`}>
                            {deltaIcon(item.delta)}
                        </span>
                    </div>
                ))}
            </div>

            {/* AI Narrative */}
            {latest?.narrative && (
                <div className="mb-5 px-4 py-3 rounded-lg bg-indigo-500/5 border-l-2 border-indigo-500/50">
                    <div className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1.5">
                        <span>🧠</span> AI Market Momentum Analysis
                    </div>
                    <p className="text-xs text-muted-foreground italic leading-relaxed">
                        "{latest.narrative}"
                    </p>
                </div>
            )}

            {/* Chart */}
            <div className="w-full" style={{ height: 'clamp(200px, 30vw, 300px)' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                        <defs>
                            <linearGradient id="gradHome" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#818cf8" stopOpacity={0.3} />
                                <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gradDraw" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.2} />
                                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gradAway" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.2} />
                                <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.06)" />
                        <XAxis
                            dataKey="time"
                            tick={{ fontSize: 9, fill: 'rgba(107,115,148,0.5)' }}
                            tickLine={false}
                            axisLine={false}
                        />
                        <YAxis
                            tick={{ fontSize: 9, fill: 'rgba(107,115,148,0.5)' }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(val) => `${val}%`}
                            domain={[5, 70]}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Area
                            type="monotone"
                            dataKey="home"
                            name={outcomes[0]}
                            stroke="#818cf8"
                            strokeWidth={2.5}
                            fill="url(#gradHome)"
                            dot={false}
                            activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                        />
                        <Area
                            type="monotone"
                            dataKey="draw"
                            name={outcomes[1]}
                            stroke="#f59e0b"
                            strokeWidth={2}
                            fill="url(#gradDraw)"
                            dot={false}
                            strokeDasharray="6 3"
                            activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                        />
                        <Area
                            type="monotone"
                            dataKey="away"
                            name={outcomes[2]}
                            stroke="#ef4444"
                            strokeWidth={2}
                            fill="url(#gradAway)"
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Footer Info */}
            <div className="mt-4 flex items-center justify-between px-3 py-2.5 rounded-lg bg-muted/30 border border-border/30 flex-wrap gap-2 text-[10px]">
                <span className="text-muted-foreground">
                    📡 {competition?.entry_count || 0} participants
                </span>
                <span className="text-muted-foreground font-mono">
                    {data.some(d => d.narrative) ? '✨ Bayesian Live Updates Active' : 'ΔP updated every 3s'}
                </span>
                <span className={competition?.status === 'active' ? 'text-emerald-400' : 'text-amber-400'}>
                    ● {competition?.status === 'active' ? 'Live' : 'Upcoming'}
                </span>
            </div>
        </motion.div>
    );
}
