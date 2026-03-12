'use client';

import React, { useRef } from 'react';
import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler,
    ChartOptions,
    ScriptableContext,
} from 'chart.js';
import type { ProbabilitySnapshot } from '@/hooks/useOnChainMarket';
import type { Competition } from '@/hooks/useCompetitions';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface Props {
    competition?: Competition | null;
    probHistory?: ProbabilitySnapshot[];
    onProbUpdate?: (prob: ProbabilitySnapshot) => void;
}

export default function ProbabilityCurve({ competition, probHistory, onProbUpdate }: Props) {
    const chartRef = useRef<any>(null);

    // Use provided history or empty
    const data = probHistory && probHistory.length > 0 ? probHistory : [];

    // Compute horizon label from competition
    const getHorizon = () => {
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
    };
    const horizon = getHorizon();
    const isLive = competition && competition.status === 'active';

    if (data.length === 0) {
        return (
            <div className="glass-card card-body animate-in">
                <div className="section-header">
                    <h3 className="section-title"><span className="icon">📊</span> Live Probability Curve</h3>
                    {competition && (
                        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                            {horizon && <span style={{ fontSize: '0.5rem', fontWeight: 800, padding: '2px 6px', borderRadius: '9999px', background: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}>{horizon}</span>}
                            {isLive && <span style={{ fontSize: '0.5rem', fontWeight: 700, padding: '2px 6px', borderRadius: '9999px', background: 'rgba(16,185,129,0.15)', color: '#10b981', animation: 'pulse 2s infinite' }}>● LIVE</span>}
                        </div>
                    )}
                </div>
                {competition && (
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>
                        {competition.title}
                    </div>
                )}
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    Waiting for competition data...
                </div>
            </div>
        );
    }

    const latest = data[data.length - 1];
    const prev = data.length > 2 ? data[data.length - 3] : latest;

    const homeDelta = latest.home - prev.home;
    const drawDelta = latest.draw - prev.draw;
    const awayDelta = latest.away - prev.away;

    const deltaIcon = (d: number) => d > 0.3 ? '▲' : d < -0.3 ? '▼' : '—';
    const deltaColor = (d: number) => d > 0.3 ? 'var(--accent-green)' : d < -0.3 ? 'var(--accent-red)' : 'var(--text-muted)';

    // Outcome labels from competition or defaults
    const outcomes = competition?.outcomes || ['Home Win', 'Draw', 'Away Win'];
    const title = competition?.title || 'Live Market';
    const sector = competition?.sector || 'Market';
    const teamHome = competition?.team_home;
    const teamAway = competition?.team_away;

    const chartData = {
        labels: data.map((d) => d.time),
        datasets: [
            {
                label: outcomes[0] || 'Home Win',
                data: data.map((d) => d.home),
                borderColor: '#818cf8',
                backgroundColor: (context: ScriptableContext<'line'>) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, 320);
                    gradient.addColorStop(0, 'rgba(129, 140, 248, 0.25)');
                    gradient.addColorStop(0.5, 'rgba(129, 140, 248, 0.08)');
                    gradient.addColorStop(1, 'rgba(129, 140, 248, 0.0)');
                    return gradient;
                },
                borderWidth: 3,
                tension: 0.45,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#818cf8',
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 2,
            },
            {
                label: outcomes[1] || 'Draw',
                data: data.map((d) => d.draw),
                borderColor: '#f59e0b',
                backgroundColor: (context: ScriptableContext<'line'>) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, 320);
                    gradient.addColorStop(0, 'rgba(245, 158, 11, 0.15)');
                    gradient.addColorStop(0.5, 'rgba(245, 158, 11, 0.04)');
                    gradient.addColorStop(1, 'rgba(245, 158, 11, 0.0)');
                    return gradient;
                },
                borderWidth: 2.5,
                tension: 0.45,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 5,
                pointHoverBackgroundColor: '#f59e0b',
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 2,
                borderDash: [6, 3],
            },
            {
                label: outcomes[2] || 'Away Win',
                data: data.map((d) => d.away),
                borderColor: '#ef4444',
                backgroundColor: (context: ScriptableContext<'line'>) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, 320);
                    gradient.addColorStop(0, 'rgba(239, 68, 68, 0.15)');
                    gradient.addColorStop(0.5, 'rgba(239, 68, 68, 0.04)');
                    gradient.addColorStop(1, 'rgba(239, 68, 68, 0.0)');
                    return gradient;
                },
                borderWidth: 2.5,
                tension: 0.45,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 5,
                pointHoverBackgroundColor: '#ef4444',
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 2,
            },
        ],
    };

    const options: ChartOptions<'line'> = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false,
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(7, 8, 15, 0.96)',
                titleFont: { family: 'Inter', weight: 'bold', size: 12 },
                bodyFont: { family: 'JetBrains Mono', size: 11 },
                footerFont: { family: 'Inter', size: 10 },
                borderColor: 'rgba(129, 140, 248, 0.25)',
                borderWidth: 1,
                padding: 14,
                cornerRadius: 10,
                displayColors: true,
                boxWidth: 8,
                boxHeight: 8,
                boxPadding: 4,
                usePointStyle: true,
                callbacks: {
                    title: (items) => `⏱ Time: ${items[0].label}`,
                    label: (ctx) => ` ${ctx.dataset.label}: ${(ctx.parsed.y as number).toFixed(1)}%`,
                    footer: (items) => {
                        const dataIndex = items[0].dataIndex;
                        const snap = data[dataIndex];
                        let lines = [];
                        
                        if (snap && snap.narrative) {
                            lines.push(`🤖 Qwen Analysis: ${snap.narrative}`);
                            lines.push('');
                        }
                        
                        if (competition?.onchain_market_pubkey) {
                            lines.push(`On-chain: ${competition.onchain_market_pubkey.slice(0, 8)}...`);
                        } else {
                            lines.push(`Sector: ${sector}`);
                        }
                        return lines;
                    },
                },
            },
        },
        scales: {
            x: {
                grid: { color: 'rgba(99, 102, 241, 0.04)', drawTicks: false },
                border: { display: false },
                ticks: { color: 'rgba(107, 115, 148, 0.5)', font: { size: 9, family: 'JetBrains Mono' }, maxTicksLimit: 8, padding: 8 },
            },
            y: {
                grid: { color: 'rgba(99, 102, 241, 0.04)', drawTicks: false },
                border: { display: false },
                ticks: { color: 'rgba(107, 115, 148, 0.5)', font: { size: 9, family: 'JetBrains Mono' }, callback: (val) => `${val}%`, padding: 8, stepSize: 10 },
                min: 5,
                max: 70,
            },
        },
        animation: { duration: 800, easing: 'easeInOutQuart' },
    };

    return (
        <div className="glass-card card-body animate-in">
            <div className="section-header">
                <h3 className="section-title"><span className="icon">📊</span> Live Probability Curve</h3>
                <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                    {horizon && <span style={{ fontSize: '0.5rem', fontWeight: 800, padding: '2px 6px', borderRadius: '9999px', background: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}>{horizon}</span>}
                    {isLive && <span style={{ fontSize: '0.5rem', fontWeight: 700, padding: '2px 6px', borderRadius: '9999px', background: 'rgba(16,185,129,0.15)', color: '#10b981', animation: 'pulse 2s infinite' }}>● LIVE</span>}
                    <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {competition?.onchain_market_pubkey ? 'On-Chain' : 'Realtime'}
                    </span>
                </div>
            </div>

            {/* Match Title */}
            <div style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.01em' }}>
                    {teamHome && teamAway ? `${teamHome} vs ${teamAway}` : title}
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {sector.charAt(0).toUpperCase() + sector.slice(1)} · {competition?.status === 'active' ? '● Live' : competition?.status === 'settled' ? '✓ Ended' : 'Upcoming'} · Realtime Analysis
                </div>
            </div>

            {/* Probability Badges with Delta */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                {[
                    { label: outcomes[0] || '🏠 Home', value: latest.home, delta: homeDelta, color: '#818cf8', bg: 'rgba(129,140,248,0.1)' },
                    { label: outcomes[1] || '🤝 Draw', value: latest.draw, delta: drawDelta, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
                    { label: outcomes[2] || '✈️ Away', value: latest.away, delta: awayDelta, color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
                ].map((item) => (
                    <div
                        key={item.label}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                            padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-round)',
                            background: item.bg, border: `1px solid ${item.color}30`,
                            fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700,
                            color: item.color, minWidth: '110px', justifyContent: 'center',
                        }}
                    >
                        <span>{item.label}</span>
                        <span>{item.value.toFixed(1)}%</span>
                        <span style={{ fontSize: '0.6rem', color: deltaColor(item.delta), fontWeight: 800 }}>
                            {deltaIcon(item.delta)}
                        </span>
                    </div>
                ))}
            </div>

            {/* AI Narrative Display */}
            {latest.narrative && (
                <div style={{
                    margin: '0.5rem 0 1rem 0',
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(129, 140, 248, 0.05)',
                    borderLeft: '3px solid var(--accent-primary)',
                    fontSize: '0.8rem',
                    fontFamily: 'var(--font-sans)',
                    color: 'var(--text-secondary)',
                    lineHeight: '1.4',
                }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.2rem', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <span>🧠</span> AI Market Momentum Analysis
                    </div>
                    <i>"{latest.narrative}"</i>
                </div>
            )}

            {/* Chart */}
            <div style={{ height: 'clamp(200px, 35vw, 320px)', position: 'relative', padding: '0 0.25rem' }}>
                <Line ref={chartRef} data={chartData} options={options} />
            </div>

            {/* Pipeline info bar */}
            <div style={{
                marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-xs)',
                background: 'var(--gradient-card)', border: '1px solid var(--border-card)',
                flexWrap: 'wrap', gap: '0.3rem',
            }}>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                    📡 {competition?.entry_count || 0} participants
                </span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {data.some(d => d.narrative) ? '✨ Bayesian Live Updates Active' : 'ΔP updated every 3s'}
                </span>
                <span style={{ fontSize: '0.6rem', color: competition?.status === 'active' ? 'var(--accent-green)' : 'var(--accent-amber)' }}>
                    ● {competition?.status === 'active' ? 'Live' : 'Upcoming'}
                </span>
            </div>
        </div>
    );
}
