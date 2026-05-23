'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useCompetitions } from '@/hooks/useCompetitions';
import { useOnChainMarket } from '@/hooks/useOnChainMarket';
import { useWallet } from '@solana/wallet-adapter-react';
import { useRealtimeAgents } from '@/hooks/useRealtimeAgents';
import { useAgentPredictions } from '@/hooks/useAgentPredictions';
import { apiFetch } from '@/lib/supabase';

const WalletProvider = dynamic(() => import('@/components/WalletProvider'), { ssr: false });
const Header = dynamic(() => import('@/components/Header'), { ssr: false });
const SectorNav = dynamic(() => import('@/components/SectorNav'), { ssr: false });
const SectorFeed = dynamic(() => import('@/components/SectorFeed'), { ssr: false });
const ProbabilityCurve = dynamic(() => import('@/components/ProbabilityCurve'), { ssr: false });
const AgentPosition = dynamic(() => import('@/components/AgentPosition'), { ssr: false });
const DataFeeds = dynamic(() => import('@/components/DataFeeds'), { ssr: false });
const CompetitionTimer = dynamic(() => import('@/components/CompetitionTimer'), { ssr: false });

function ProbabilityCurveSkeleton() {
    return (
        <div className="glass-card card-body animate-pulse" style={{
            position: 'relative',
            height: '420px',
            background: 'var(--gradient-card)',
            border: '1px solid var(--border-card)',
            borderRadius: '16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '1.25rem',
            marginBottom: '1rem'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ width: '120px', height: '14px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px' }} />
                <div style={{ width: '80px', height: '14px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', margin: '1rem 0' }}>
                <div style={{ width: '220px', height: '24px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px' }} />
                <div style={{ width: '140px', height: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }} />
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: '1rem', padding: '0.5rem 0' }}>
                <div style={{ width: '100%', height: '40%', background: 'rgba(255,255,255,0.03)', borderRadius: '4px' }} />
                <div style={{ width: '100%', height: '60%', background: 'rgba(255,255,255,0.03)', borderRadius: '4px' }} />
                <div style={{ width: '100%', height: '50%', background: 'rgba(255,255,255,0.03)', borderRadius: '4px' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                <div style={{ width: '100px', height: '10px', background: 'rgba(255,255,255,0.04)', borderRadius: '4px' }} />
                <div style={{ width: '120px', height: '10px', background: 'rgba(255,255,255,0.04)', borderRadius: '4px' }} />
            </div>
        </div>
    );
}

function ForYouInner() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
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

  useEffect(() => {
    const saved = localStorage.getItem('exoduze_theme');
    if (saved === 'light' || saved === 'dark') setTheme(saved);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('exoduze_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // Agent data for neural lines on curve
  const { publicKey } = useWallet();
  const {
      forecasters,
      pauseForecaster,
      resumeForecaster,
      stopForecaster,
  } = useRealtimeAgents(publicKey?.toString() || null);

  // Real competition data from backend + Supabase realtime for "foryou" sector
  const { competitions, activeCompetition: defaultActiveComp, loading: compLoading } = useCompetitions('foryou');

  // Determine which competition to show the curve for
  const activeCompetition = selectedCompId
      ? competitions.find(c => c.id === selectedCompId) || defaultActiveComp
      : defaultActiveComp;

  // Market data for the active competition (probability history)
  const { probHistory, loading: marketLoading } = useOnChainMarket(activeCompetition?.id);

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

  // Competition timing — from real data or defaults
  const competitionStart = activeCompetition
      ? Math.floor(new Date(activeCompetition.competition_start).getTime() / 1000)
      : Math.floor(Date.now() / 1000) - 3600;
  const competitionEnd = activeCompetition
      ? Math.floor(new Date(activeCompetition.competition_end).getTime() / 1000)
      : Math.floor(Date.now() / 1000) + 7200;

  // Filter forecasters: show only agents enrolled in the active competition
  const filteredForecasters = forecasters.filter(f => {
      if (!f.competitions || f.competitions.length === 0) return false;
      return f.competitions.some((entry: any) => entry.competition_id === activeCompetition?.id);
  });

  return (
    <>
      <Header theme={theme} onToggleTheme={toggleTheme} activeSector="foryou" />
      <main className="main-container">
        <SectorNav activeSector="foryou" onSectorChange={() => {}} />

        <div className="sector-content-transition" style={{ marginTop: '1rem' }}>
            {compLoading || marketLoading ? (
                <ProbabilityCurveSkeleton />
            ) : (
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
            )}

            {activeCompetition && (
                <CompetitionTimer
                    startTime={competitionStart}
                    endTime={competitionEnd}
                    label={activeCompetition.title}
                />
            )}

            <div style={{ margin: '1rem 0' }}>
                <DataFeeds category="foryou" />
            </div>

            <SectorFeed 
                sector="foryou" 
                selectedCompId={activeCompetition?.id} 
                onSelectCompetition={setSelectedCompId} 
            />

            <AgentPosition />
        </div>
      </main>
    </>
  );
}

export default function ForYouPage() {
  return (
    <WalletProvider>
      <ForYouInner />
    </WalletProvider>
  );
}
