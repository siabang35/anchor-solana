import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useCompetitions } from '../../../hooks/useCompetitions';
import { useOnChainMarket } from '../../../hooks/useOnChainMarket';
import { useClusterData } from '../../../hooks/useClusterData';
import { useLiveFeed } from '../../../hooks/useLiveFeed';
import { ProbabilityCurve } from '../../components/competition/ProbabilityCurve';
import { CompetitionTimer } from '../../components/competition/CompetitionTimer';
import { CompetitionGrid } from '../../components/competition/CompetitionGrid';
import { ClusterDataPanel } from '../../components/competition/ClusterDataPanel';
import { LiveFeedPanel } from '../../components/competition/LiveFeedPanel';
import { DeployAgentPanel } from '../../components/competition/DeployAgentPanel';
import { Leaderboard } from '../../components/competition/Leaderboard';

const SECTOR_META: Record<string, { label: string; icon: string; color: string; description: string }> = {
    politics: { label: 'Politics', icon: '🏛️', color: '#818cf8', description: 'Political events, regulatory decisions, and government policy predictions' },
    finance: { label: 'Finance', icon: '📈', color: '#10b981', description: 'Financial markets, earnings, interest rates, and economic indicators' },
    crypto: { label: 'Crypto', icon: '₿', color: '#f59e0b', description: 'Cryptocurrency markets, DeFi protocols, and blockchain events' },
    tech: { label: 'Technology', icon: '💻', color: '#6366f1', description: 'Tech industry events, product launches, and innovation milestones' },
    economy: { label: 'Economy', icon: '🌍', color: '#14b8a6', description: 'Macroeconomic indicators, GDP, inflation, and trade data' },
    science: { label: 'Science', icon: '🔬', color: '#8b5cf6', description: 'Scientific breakthroughs, clinical trials, and research milestones' },
    sports: { label: 'Sports', icon: '⚽', color: '#ef4444', description: 'Sports match outcomes, tournament predictions, and player performance' },
};

function getCompetitionStatus(comp: any): 'live' | 'upcoming' | 'ended' {
    const now = Date.now();
    const start = new Date(comp.competition_start).getTime();
    const end = new Date(comp.competition_end).getTime();
    if (now >= start && now <= end) return 'live';
    if (now < start) return 'upcoming';
    return 'ended';
}

export default function CategoryCompetitionPage() {
    const { sector } = useParams<{ sector: string }>();
    const navigate = useNavigate();
    const sectorId = sector || 'finance';
    const meta = SECTOR_META[sectorId] || SECTOR_META.finance;

    const [selectedCompId, setSelectedCompId] = useState<string | null>(null);

    const { competitions, loading: compLoading, connected } = useCompetitions(sectorId);

    const sorted = useMemo(() => [...competitions].sort((a, b) => {
        const order = { live: 0, upcoming: 1, ended: 2 };
        const diff = order[getCompetitionStatus(a)] - order[getCompetitionStatus(b)];
        if (diff !== 0) return diff;
        return new Date(a.competition_start).getTime() - new Date(b.competition_start).getTime();
    }), [competitions]);

    const activeComp = selectedCompId
        ? sorted.find(c => c.id === selectedCompId) || sorted.find(c => getCompetitionStatus(c) === 'live') || sorted[0]
        : sorted.find(c => getCompetitionStatus(c) === 'live') || sorted[0] || null;

    const { probHistory } = useOnChainMarket(activeComp?.id);
    const { clusters, connected: clusterConnected } = useClusterData(activeComp?.id);
    const { feeds, connected: feedConnected } = useLiveFeed(15, sectorId);

    const liveCount = sorted.filter(c => getCompetitionStatus(c) === 'live').length;

    const competitionStart = activeComp
        ? Math.floor(new Date(activeComp.competition_start).getTime() / 1000)
        : Math.floor(Date.now() / 1000) - 3600;
    const competitionEnd = activeComp
        ? Math.floor(new Date(activeComp.competition_end).getTime() / 1000)
        : Math.floor(Date.now() / 1000) + 7200;

    return (
        <div className="container mx-auto px-4 py-6 space-y-4 max-w-7xl">
            {/* Category Hero Header */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border bg-card/50 backdrop-blur-md p-5 md:p-6"
                style={{ borderColor: `${meta.color}30`, borderLeftWidth: '4px', borderLeftColor: meta.color }}
            >
                <div className="flex items-start md:items-center justify-between flex-col md:flex-row gap-3">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <button
                                onClick={() => navigate('/competition')}
                                className="px-3 py-1 text-[10px] font-semibold rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
                            >
                                ← Dashboard
                            </button>
                            <span className="text-2xl">{meta.icon}</span>
                            <h1 className="text-xl md:text-2xl font-extrabold text-foreground">{meta.label}</h1>
                        </div>
                        <p className="text-xs text-muted-foreground max-w-lg">{meta.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {liveCount > 0 && (
                            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 animate-pulse">
                                {liveCount} LIVE
                            </span>
                        )}
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                            connected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                        }`}>
                            {connected ? '● Connected' : '○ Connecting...'}
                        </span>
                    </div>
                </div>

                {/* Category Navigation */}
                <div className="flex gap-2 mt-4 flex-wrap">
                    {Object.entries(SECTOR_META).map(([id, m]) => (
                        <button
                            key={id}
                            onClick={() => navigate(`/competition/${id}`)}
                            className={`
                                px-3 py-1.5 rounded-full text-[11px] font-bold transition-all duration-200
                                ${id === sectorId
                                    ? 'border-2 shadow-sm'
                                    : 'border border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60'
                                }
                            `}
                            style={id === sectorId ? {
                                borderColor: m.color,
                                color: m.color,
                                background: `${m.color}10`,
                            } : {}}
                        >
                            {m.icon} {m.label}
                        </button>
                    ))}
                </div>
            </motion.div>

            {/* Probability Curve */}
            <ProbabilityCurve competition={activeComp} probHistory={probHistory} />

            {/* Competition Timer */}
            {activeComp && (
                <CompetitionTimer
                    startTime={competitionStart}
                    endTime={competitionEnd}
                    label={activeComp.title}
                />
            )}

            {/* Competition Grid */}
            <CompetitionGrid
                competitions={sorted}
                loading={compLoading}
                selectedCompId={activeComp?.id}
                categoryColor={meta.color}
                categoryLabel={meta.label}
                onSelectCompetition={setSelectedCompId}
            />

            {/* Cluster Data + Live Feed */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ClusterDataPanel
                    clusters={clusters}
                    connected={clusterConnected}
                    categoryColor={meta.color}
                />
                <LiveFeedPanel
                    feeds={feeds}
                    connected={feedConnected}
                    categoryLabel={meta.label}
                />
            </div>

            {/* Deploy Agent + Leaderboard */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <DeployAgentPanel initialCategory={sectorId} />
                <Leaderboard />
            </div>
        </div>
    );
}
