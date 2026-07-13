'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useCompetitions } from '@/hooks/useCompetitions';
import { useOnChainMarket } from '@/hooks/useOnChainMarket';
import { useWallet } from '@solana/wallet-adapter-react';
import { useRealtimeAgents } from '@/hooks/useRealtimeAgents';
import { useAgentPredictions } from '@/hooks/useAgentPredictions';
import { apiFetch } from '@/lib/supabase';


const Header = dynamic(() => import('@/components/Header'), { ssr: false });
const SectorNav = dynamic(() => import('@/components/SectorNav'), { ssr: false });
const SectorFeed = dynamic(() => import('@/components/SectorFeed'), { ssr: false });
const ProbabilityCurve = dynamic(() => import('@/components/ProbabilityCurve'), { ssr: false });
const AgentPosition = dynamic(() => import('@/components/AgentPosition'), { ssr: false });
const DataFeeds = dynamic(() => import('@/components/DataFeeds'), { ssr: false });
const DeployAgent = dynamic(() => import('@/components/DeployAgent'), { ssr: false });
const CompetitionTimer = dynamic(() => import('@/components/CompetitionTimer'), { ssr: false });

function HomeInner() {
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const [activeSector, setActiveSector] = useState('top');
    const [selectedCompId, setSelectedCompId] = useState<string | null>(null);
    const [competitors, setCompetitors] = useState<any[]>([]);

    // Restore selected competition from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem('selected_competition_id');
        if (stored) {
            setSelectedCompId(stored);
            localStorage.removeItem('selected_competition_id');
        }
    }, []);

    // Set active sector from URL query param if present
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const sector = params.get('sector');
            if (sector) {
                setActiveSector(sector);
            }
        }
    }, []);

    // Agent data for neural lines on curve
    const { publicKey } = useWallet();
    const {
        forecasters,
        pauseForecaster,
        resumeForecaster,
        stopForecaster,
    } = useRealtimeAgents(publicKey?.toString() || null);

    // Real competition data from backend + Supabase realtime
    const { competitions, activeCompetition: defaultActiveComp, loading: compLoading } = useCompetitions(activeSector);

    // Determine which competition to show the curve for
    const activeCompetition = selectedCompId
        ? competitions.find(c => c.id === selectedCompId) || defaultActiveComp
        : defaultActiveComp;

    // Market data for the active competition (probability history)
    const { probHistory } = useOnChainMarket(activeCompetition?.id);

    // Real-time agent predictions for the active competition
    const { predictionsByAgent } = useAgentPredictions(activeCompetition?.id);

    // Build a Map<agentId, AgentPrediction[]> for ProbabilityCurve
    const agentPredictionsMap = useMemo(() => {
        const map = new Map<string, any[]>();
        for (const [agentId, group] of predictionsByAgent) {
            map.set(agentId, group.predictions);
        }
        return map;
    }, [predictionsByAgent]);

    // Fetch competitors for the active competition to render on the curve
    useEffect(() => {
        if (!activeCompetition?.id) return;
        let cancelled = false;

        const fetchCompetitors = async () => {
            try {
                const res = await apiFetch<any[]>(`/agents/competitors?competition_id=${activeCompetition.id}&limit=50`);
                if (!cancelled && res) {
                    setCompetitors(res);
                }
            } catch (err) {
                console.error('Failed to fetch competitors:', err);
            }
        };

        fetchCompetitors();
        const interval = setInterval(fetchCompetitors, 30_000);
        return () => { cancelled = true; clearInterval(interval); };
    }, [activeCompetition?.id]);

    // Load theme from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem('exoduze_theme');
        if (saved === 'light' || saved === 'dark') {
            setTheme(saved);
        }
    }, []);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('exoduze_theme', theme);
    }, [theme]);

    const toggleTheme = useCallback(() => {
        setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
    }, []);

    // Competition timing — from real data or defaults
    const competitionStart = activeCompetition
        ? Math.floor(new Date(activeCompetition.competition_start).getTime() / 1000)
        : Math.floor(Date.now() / 1000) - 3600;
    const competitionEnd = activeCompetition
        ? Math.floor(new Date(activeCompetition.competition_end).getTime() / 1000)
        : Math.floor(Date.now() / 1000) + 7200;

    // Filter forecasters: show only agents enrolled in the active competition
    // OR enrolled in any competition within the currently viewed sector
    const filteredForecasters = forecasters.filter(f => {
        if (!f.competitions || f.competitions.length === 0) return false;
        return f.competitions.some((entry: any) =>
            entry.competition_id === activeCompetition?.id ||
            (entry.sector && activeSector !== 'top' && entry.sector.toLowerCase() === activeSector.toLowerCase())
        );
    });

    return (
        <>
            <Header
                theme={theme} onToggleTheme={toggleTheme}
                activeSector={activeSector}
                onSectorChange={(s) => { setActiveSector(s); setSelectedCompId(null); }}
            />
            <main className="main-container">
                {/* Sector Navigation */}
                <SectorNav activeSector={activeSector} onSectorChange={(s) => { setActiveSector(s); setSelectedCompId(null); }} />

                {/* Content area — smooth transition on sector change */}
                <div key={activeSector} className="sector-content-transition">
                    {/* Live Probability Curve */}
                    <ProbabilityCurve
                        competition={activeCompetition}
                        probHistory={probHistory}
                        forecasters={[
                            ...filteredForecasters,
                            ...competitors
                                .slice(0, 7)
                                .filter(c => !forecasters.find(f => f.id === c.agent_id))
                                .map(c => ({
                                    id: c.agent_id,
                                    name: c.agent_name,
                                    user_id: '',
                                    system_prompt: '',
                                    status: c.agent_status || 'active',
                                    model: c.model || 'Competitor',
                                    prompts_used: 0,
                                    max_free_prompts: 7,
                                    created_at: c.deployed_at || new Date().toISOString(),
                                    updated_at: c.deployed_at || new Date().toISOString(),
                                    competitions: [],
                                    isExternal: true,
                                }))
                        ] as any[]}
                        onPauseAgent={pauseForecaster}
                        onResumeAgent={resumeForecaster}
                        onStopAgent={stopForecaster}
                        onDeleteAgent={stopForecaster}
                        agentPredictions={agentPredictionsMap}
                    />

                    {/* Competition Timer — real data from backend */}
                    <CompetitionTimer
                        startTime={competitionStart}
                        endTime={competitionEnd}
                        label={activeCompetition?.title || 'Current Competition'}
                    />

                    {/* Data Feeds (Live Feed) */}
                    <div style={{ margin: '1rem 0' }}>
                        <DataFeeds category={activeSector} />
                    </div>

                    {/* Sector Feed — Realtime Data */}
                    <SectorFeed sector={activeSector} selectedCompId={activeCompetition?.id} onSelectCompetition={setSelectedCompId} />

                    {/* AI Agent Positions */}
                    <AgentPosition />
                </div>

                {/* Deploy Agent (Only when a specific sector is selected) */}
                {/* Placed outside the transition div so position: fixed works on mobile */}
                {activeSector !== 'top' && (
                    <div className="deploy-desktop-column" style={{ width: '100%', minWidth: 0, marginTop: '1rem' }}>
                        <DeployAgent initialCategory={activeSector} />
                    </div>
                )}
            </main>
        </>
    );
}

export default function Home() {
    return <HomeInner />;
}

