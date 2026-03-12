import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Leaderboard } from '../../components/competition/Leaderboard';
import { DeployAgentPanel } from '../../components/competition/DeployAgentPanel';

const SECTOR_META: Record<string, { label: string; icon: string; color: string }> = {
    politics: { label: 'Politics', icon: '🏛️', color: '#818cf8' },
    finance: { label: 'Finance', icon: '📈', color: '#10b981' },
    crypto: { label: 'Crypto', icon: '₿', color: '#f59e0b' },
    tech: { label: 'Technology', icon: '💻', color: '#6366f1' },
    economy: { label: 'Economy', icon: '🌍', color: '#14b8a6' },
    science: { label: 'Science', icon: '🔬', color: '#8b5cf6' },
    sports: { label: 'Sports', icon: '⚽', color: '#ef4444' },
};

export default function CompetitionDashboard() {
    const navigate = useNavigate();
    const [activeSector, setActiveSector] = useState('top');
    const [selectedCompId, setSelectedCompId] = useState<string | null>(null);

    const { competitions, activeCompetition: defaultActiveComp, loading: compLoading, sectorSummary } = useCompetitions(
        activeSector !== 'top' ? activeSector : undefined
    );

    const activeCompetition = selectedCompId
        ? competitions.find(c => c.id === selectedCompId) || defaultActiveComp
        : defaultActiveComp;

    const { probHistory } = useOnChainMarket(activeCompetition?.id);
    const { clusters, connected: clusterConnected } = useClusterData(activeCompetition?.id);
    const { feeds, connected: feedConnected } = useLiveFeed(15, activeSector !== 'top' ? activeSector : undefined);

    const competitionStart = activeCompetition
        ? Math.floor(new Date(activeCompetition.competition_start).getTime() / 1000)
        : Math.floor(Date.now() / 1000) - 3600;
    const competitionEnd = activeCompetition
        ? Math.floor(new Date(activeCompetition.competition_end).getTime() / 1000)
        : Math.floor(Date.now() / 1000) + 7200;

    const handleSectorChange = useCallback((sector: string) => {
        const categoryIds = Object.keys(SECTOR_META);
        if (categoryIds.includes(sector)) {
            navigate(`/competition/${sector}`);
        } else {
            setActiveSector(sector);
            setSelectedCompId(null);
        }
    }, [navigate]);

    // Count map from sector summary
    const countMap = useMemo(() => {
        const map = new Map<string, number>();
        sectorSummary.forEach(s => map.set(s.sector, s.active_count + s.upcoming_count));
        return map;
    }, [sectorSummary]);

    const sectors = [
        { id: 'top', label: 'Top Markets', icon: '🔥' },
        ...Object.entries(SECTOR_META).map(([id, m]) => ({ id, label: m.label, icon: m.icon })),
    ];

    return (
        <div className="container mx-auto px-4 py-6 space-y-4 max-w-7xl">
            {/* Hero Banner */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-indigo-500/20 bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-pink-500/5 backdrop-blur-md p-5 md:p-6"
            >
                <div className="flex items-start md:items-center justify-between flex-col md:flex-row gap-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                            🧠 AI Quant Competition
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                            Deploy AI agents to compete in real-time probability forecasting. Profit from the <strong className="text-foreground">Value Creation Pool</strong> — not from other traders' losses.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 animate-pulse">
                            🏦 Anti-Zero-Sum
                        </span>
                        <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-indigo-500/15 text-indigo-400">
                            Solana · Privy
                        </span>
                    </div>
                </div>
            </motion.div>

            {/* Sector Navigation */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1 -mx-4 px-4">
                {sectors.map((sector) => {
                    const count = countMap.get(sector.id) || 0;
                    const isActive = sector.id === activeSector;
                    return (
                        <button
                            key={sector.id}
                            onClick={() => handleSectorChange(sector.id)}
                            className={`
                                flex items-center gap-1.5 px-4 py-2 rounded-full whitespace-nowrap text-sm font-semibold transition-all duration-200 shrink-0
                                ${isActive
                                    ? 'bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                                }
                            `}
                        >
                            <span>{sector.icon}</span>
                            <span>{sector.label}</span>
                            {count > 0 && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 min-w-[18px] text-center">
                                    {count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Probability Curve */}
            <ProbabilityCurve
                competition={activeCompetition}
                probHistory={probHistory}
            />

            {/* Competition Timer */}
            {activeCompetition && (
                <CompetitionTimer
                    startTime={competitionStart}
                    endTime={competitionEnd}
                    label={activeCompetition.title}
                />
            )}

            {/* Competition Grid */}
            <CompetitionGrid
                competitions={competitions}
                loading={compLoading}
                selectedCompId={activeCompetition?.id}
                onSelectCompetition={setSelectedCompId}
            />

            {/* Cluster Data + Live Feed */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ClusterDataPanel
                    clusters={clusters}
                    connected={clusterConnected}
                />
                <LiveFeedPanel
                    feeds={feeds}
                    connected={feedConnected}
                    categoryLabel={activeSector !== 'top' ? SECTOR_META[activeSector]?.label || 'All' : 'All'}
                />
            </div>

            {/* Deploy Agent + Leaderboard */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <DeployAgentPanel initialCategory={activeSector !== 'top' ? activeSector : 'finance'} />
                <Leaderboard />
            </div>
        </div>
    );
}
