'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
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
    ChartEvent,
    ActiveElement,
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import type { ProbabilitySnapshot } from '@/hooks/useOnChainMarket';
import type { Competition } from '@/hooks/useCompetitions';
import type { ForecasterAgent } from '@/hooks/useRealtimeAgents';
import type { AgentPrediction } from '@/hooks/useAgentPredictions';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler, annotationPlugin);

// ── Unique colors for agent lines (neural palette) ───────────────
const AGENT_COLORS = [
    '#06b6d4', '#a855f7', '#f97316', '#ec4899', '#14b8a6',
    '#eab308', '#3b82f6', '#22d3ee', '#d946ef', '#84cc16',
    '#fb923c', '#2dd4bf', '#c084fc', '#f472b6', '#34d399',
];

// Helper to hash a string to a number for deterministic random behavior
function hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

// Helper to convert "09:14:31 PM" or ISO strings to total seconds in the current day
function parseTimeToSeconds(timeStr: string | Date): number {
    if (timeStr instanceof Date) {
        return timeStr.getHours() * 3600 + timeStr.getMinutes() * 60 + timeStr.getSeconds();
    }
    const str = String(timeStr).replace("'", '');
    // Try to parse HH:MM:SS PM
    const ampmMatch = str.match(/(\d+):(\d+):?(\d*)\s*([AaPp][Mm])?/);
    if (ampmMatch) {
        let [_, h, m, s, ampm] = ampmMatch;
        let hours = parseInt(h, 10);
        if (ampm) {
            ampm = ampm.toUpperCase();
            if (ampm === 'PM' && hours < 12) hours += 12;
            if (ampm === 'AM' && hours === 12) hours = 0;
        }
        return hours * 3600 + parseInt(m, 10) * 60 + (s ? parseInt(s, 10) : 0);
    }
    // Fallback Date parse
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
        return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
    }
    return 0;
}

// ── Build real agent prediction curve or tracking line ──
function buildRealAgentCurve(
    chartLabels: string[],
    predictions: AgentPrediction[],
    baseData: number[],
    agentName: string,
    agentIndex: number,
): (number | null)[] {
    const h = hashString(agentName);
    const freq1 = 0.3 + (h % 50) / 100;
    const freq2 = 0.15 + (h % 30) / 100;
    const phase1 = h % Math.PI;
    const phase2 = (h % 100) / 10;
    const bias = ((h % 20) - 10) / 2; // -5 to +5%

    const getTrackingPoint = (i: number, base: number) => {
        const bounce = Math.sin(i * freq1 + phase1) * 8 + Math.cos(i * freq2 + phase2) * 5 + bias;
        return Math.max(5, Math.min(95, base + bounce));
    };

    // 1. If no predictions, fall back to tracking the main curve visually
    if (!predictions || predictions.length === 0) {
        return chartLabels.map((_, i) => getTrackingPoint(i, baseData[i] || 50));
    }

    // 2. Map actual predictions + their projected curves by exact seconds
    // We store { secondsOfDay -> probability }
    const predPoints: { sec: number; prob: number }[] = [];

    for (const pred of predictions) {
        const predTime = new Date(pred.timestamp);
        const baseSec = parseTimeToSeconds(predTime);
        predPoints.push({ sec: baseSec, prob: pred.probability * 100 });

        if (pred.projected_curve && Array.isArray(pred.projected_curve)) {
            for (const proj of pred.projected_curve) {
                if (!proj) continue;
                const futureSec = baseSec + (proj.timestamp_offset_mins * 60);
                predPoints.push({ sec: futureSec, prob: proj.probability * 100 });
            }
        }
    }
    
    // Sort points by time
    predPoints.sort((a, b) => a.sec - b.sec);

    // 3. Build the chart array by matching chartLabel seconds to closest prediction seconds
    const result: (number | null)[] = chartLabels.map(() => null);
    
    // Map each chart column to its seconds value
    const chartTimeMap = chartLabels.map(lbl => parseTimeToSeconds(lbl));

    let firstPredIdx = -1;
    let lastPredIdx = -1;

    // For each known prediction point, find the absolute closest chart time 
    for (const pt of predPoints) {
        let bestIdx = -1;
        let minDiff = Infinity; 
        
        for (let i = 0; i < chartTimeMap.length; i++) {
            const diff = Math.abs(chartTimeMap[i] - pt.sec);
            if (diff < minDiff) {
                minDiff = diff;
                bestIdx = i;
            }
        }
        
        if (bestIdx !== -1) {
            result[bestIdx] = pt.prob;
            if (firstPredIdx === -1 || bestIdx < firstPredIdx) firstPredIdx = bestIdx;
            if (bestIdx > lastPredIdx) lastPredIdx = bestIdx;
        }
    }

    // 4. Interpolate gaps and add visual "battling" jitter anchored to real data
    if (firstPredIdx !== -1) {
        // Space BEFORE the first prediction naturally tracks the reference curve
        for (let i = 0; i < firstPredIdx; i++) {
            result[i] = getTrackingPoint(i, baseData[i] || 50);
        }

        let prevIdx = firstPredIdx;
        let prevVal = result[firstPredIdx]!;

        for (let i = firstPredIdx + 1; i <= lastPredIdx; i++) {
            if (result[i] !== null) {
                const gap = i - prevIdx;
                if (gap > 1) {
                    const startVal = prevVal;
                    const endVal = result[i]!;
                    for (let j = prevIdx + 1; j < i; j++) {
                        const t = (j - prevIdx) / gap;
                        const interpolatedBase = startVal + (endVal - startVal) * t;
                        result[j] = getTrackingPoint(j, interpolatedBase);
                    }
                }
                prevIdx = i;
                prevVal = result[i]!;
            }
        }

        // Space AFTER the final projected point flatlines the real prediction, but keeps jittering
        for (let i = lastPredIdx + 1; i < chartLabels.length; i++) {
            result[i] = getTrackingPoint(i, result[lastPredIdx]!);
        }
    } else {
        // Failsafe if absolutely no predictions matched
        return chartLabels.map((_, i) => getTrackingPoint(i, baseData[i] || 50));
    }

    return result;
}

// ── Build absolute true data trajectory line (straight, no jitter) ──
function buildTrueAgentCurve(
    chartLabels: string[],
    predictions: AgentPrediction[],
): (number | null)[] {
    if (!predictions || predictions.length === 0) {
        return chartLabels.map(() => null);
    }

    const predPoints: { sec: number; prob: number }[] = [];

    for (const pred of predictions) {
        const predTime = new Date(pred.timestamp);
        const baseSec = parseTimeToSeconds(predTime);
        predPoints.push({ sec: baseSec, prob: pred.probability * 100 });

        if (pred.projected_curve && Array.isArray(pred.projected_curve)) {
            for (const proj of pred.projected_curve) {
                if (!proj) continue;
                const futureSec = baseSec + (proj.timestamp_offset_mins * 60);
                predPoints.push({ sec: futureSec, prob: proj.probability * 100 });
            }
        }
    }
    
    predPoints.sort((a, b) => a.sec - b.sec);

    const result: (number | null)[] = chartLabels.map(() => null);
    const chartTimeMap = chartLabels.map(lbl => parseTimeToSeconds(lbl));

    for (const pt of predPoints) {
        let bestIdx = -1;
        let minDiff = Infinity;
        
        for (let i = 0; i < chartTimeMap.length; i++) {
            const diff = Math.abs(chartTimeMap[i] - pt.sec);
            if (diff < minDiff) {
                minDiff = diff;
                bestIdx = i;
            }
        }
        
        if (bestIdx !== -1) {
            result[bestIdx] = pt.prob;
        }
    }

    return result;
}

// ── Agent control popover ────────────────────────────────────────
interface AgentPopover {
    agent: ForecasterAgent;
    color: string;
    x: number;
    y: number;
}

interface Props {
    competition?: Competition | null;
    probHistory?: ProbabilitySnapshot[];
    onProbUpdate?: (prob: ProbabilitySnapshot) => void;
    // Agent integration
    forecasters?: ForecasterAgent[];
    agentPredictions?: Map<string, AgentPrediction[]>;
    onPauseAgent?: (id: string) => Promise<void>;
    onResumeAgent?: (id: string) => Promise<void>;
    onStopAgent?: (id: string) => Promise<void>;
    onDeleteAgent?: (id: string) => Promise<void>;
}

export default function ProbabilityCurve({
    competition,
    probHistory,
    onProbUpdate,
    forecasters = [],
    agentPredictions,
    onPauseAgent,
    onResumeAgent,
    onStopAgent,
    onDeleteAgent,
}: Props) {
    const chartRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [popover, setPopover] = useState<AgentPopover | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [confirmAction, setConfirmAction] = useState<{ id: string; type: 'stop' | 'delete' } | null>(null);

    // Close popover on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('.agent-popover') && !target.closest('canvas')) {
                setPopover(null);
                setConfirmAction(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Only show active/paused agents on the chart (not terminated)
    const visibleAgents = forecasters.filter(
        a => a.status === 'active' || a.status === 'paused' || a.status === 'exhausted',
    );

    const data = probHistory && probHistory.length > 0 ? probHistory : [];
    const baseHomeData = data.map(d => d.home);

    // ── Action handlers ──────────────────────────────────────────
    const handleAction = useCallback(async (agentId: string, action: 'pause' | 'resume' | 'stop' | 'delete') => {
        setActionLoading(agentId);
        try {
            if (action === 'pause' && onPauseAgent) await onPauseAgent(agentId);
            else if (action === 'resume' && onResumeAgent) await onResumeAgent(agentId);
            else if (action === 'stop' && onStopAgent) await onStopAgent(agentId);
            else if (action === 'delete' && onDeleteAgent) await onDeleteAgent(agentId);
            if (action === 'stop' || action === 'delete') {
                setPopover(null);
                setConfirmAction(null);
            }
        } finally {
            setActionLoading(null);
        }
    }, [onPauseAgent, onResumeAgent, onStopAgent, onDeleteAgent]);

    // ── Horizon + live status ────────────────────────────────────
    const getHorizon = () => {
        if (!competition) return '';
        const end = new Date(competition.competition_end).getTime();
        const now = Date.now();
        const hours = Math.max(0, (end - now) / (1000 * 60 * 60));
        if (hours <= 2) return '2H';
        if (hours <= 7) return '7H';
        if (hours <= 12) return '12H';
        if (hours <= 24) return '24H';
        if (hours <= 72) return '3D';
        return '7D';
    };
    const horizon = getHorizon();
    const isLive = competition && competition.status === 'active';

    // ── Empty state ──────────────────────────────────────────────
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

    const outcomes = competition?.outcomes || ['Home Win', 'Draw', 'Away Win'];
    const title = competition?.title || 'Live Market';
    const sector = competition?.sector || 'Market';
    const teamHome = competition?.team_home;
    const teamAway = competition?.team_away;

    // ── Build agent datasets (neural lines) ──────────────────────
    // First dataset index for agents (after the 3 base datasets)
    // First dataset index for agents (after the 3 base datasets)
    const AGENT_DATASET_OFFSET = 3;

    // ── Extend X-axis for future agent projections / Competition End Horizon ──
    const chartLabels = data.map(d => d.time);
    if (data.length > 0 && competition) {
        let lastTimeSec = parseTimeToSeconds(chartLabels[chartLabels.length - 1]);
        
        // Find seconds remaining in the competition
        const endSec = Math.floor(new Date(competition.competition_end).getTime() / 1000);
        const nowSec = Math.floor(Date.now() / 1000);
        
        // Ensure a continuous high-resolution timeline (15s steps) projecting up to 30 minutes into the future.
        // This prevents the category axis from warping and visually swallowing short-term predictions.
        let remSec = Math.max(120, endSec - nowSec);
        remSec = Math.min(remSec, 1800); // hard cap at 30 minutes forward look
        
        const step = 15; // strict 15-second intervals
        
        for (let offset = step; offset <= remSec; offset += step) {
            const fTime = lastTimeSec + offset;
            const d = new Date();
            d.setHours(Math.floor(fTime / 3600));
            d.setMinutes(Math.floor((fTime % 3600) / 60));
            d.setSeconds(fTime % 60);
            chartLabels.push(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        }
    }

    const agentDatasets = visibleAgents.flatMap((agent, idx) => {
        // Generate a distinct neon color from the agent's ID hash for infinite scale
        const h = Math.abs(hashString(agent.id));
        const color = `hsl(${h % 360}, 85%, 65%)`;
        
        const isPaused = agent.status === 'paused' || agent.status === 'exhausted';
        const isMassive = visibleAgents.length > 15; // Enable performance scaling

        // Use real prediction data if available, otherwise show tracking curve
        const agentPreds = agentPredictions?.get(agent.id) || [];
        const curveData = buildRealAgentCurve(chartLabels, agentPreds, baseHomeData, agent.name, idx);
        const trueData = buildTrueAgentCurve(chartLabels, agentPreds);
        const hasPredictions = agentPreds.length > 0;

        const mainDataset = {
            label: `🤖 ${agent.name}${hasPredictions ? ` (${agentPreds.length} preds · Pred: ${agentPreds[agentPreds.length - 1].probability * 100}%)` : ' 🔥 Competing'}`,
            data: curveData,
            borderColor: isPaused ? color.replace(')', ', 0.4)').replace('hsl', 'hsla') : color,
            backgroundColor: 'transparent',
            borderWidth: isMassive ? 0.8 : (isPaused ? 1.5 : hasPredictions ? 2.5 : 2),
            tension: 0.35,
            fill: false,
            pointRadius: 0,
            pointHitRadius: isMassive ? 0 : 12,
            pointHoverRadius: isMassive ? 0 : 7,
            pointHoverBackgroundColor: color,
            pointHoverBorderColor: '#fff',
            pointHoverBorderWidth: isMassive ? 0 : 2,
            borderDash: isPaused ? [6, 4] : [],
            spanGaps: true,
            order: 0,
            normalized: true, // Boost parsing perf for massive arrays
        };

        if (hasPredictions && !isMassive) {
            const trueDataset = {
                label: `🎯 ${agent.name} (Real)`,
                data: trueData,
                borderColor: 'rgba(255, 255, 255, 0.4)', // Straight line, different color (white translucent)
                borderWidth: 1.5,
                tension: 0, // Straight uncurved line
                fill: false,
                borderDash: [3, 4], // Dashed
                pointRadius: 2.5, // Tiny dots showing strictly real data
                pointBackgroundColor: '#fff',
                pointBorderColor: color,
                spanGaps: true,
                order: 1, // Draw behind the bouncy curve
            };
            return [mainDataset, trueDataset];
        }

        return [mainDataset];
    });

    // ── Build Momentum Vector (Trend Projection) or Status Quo Baseline ──
    const momentumDataset: any[] = [];
    if (data.length > 0 && chartLabels.length > data.length) {
        const rootIdx = data.length - 1;
        const currentProb = data[rootIdx].home;
        
        let slopePerStep = 0;
        let label = "Status Quo Baseline";
        let isPositive = true;

        if (data.length >= 3) {
            const p1 = data[data.length - 3].home;
            const p2 = currentProb;
            const slope = (p2 - p1) / 2;
            slopePerStep = slope * 0.25;
            label = "🚀 Market Momentum";
            isPositive = slope >= 0;
        }
        
        const momentumData = chartLabels.map(() => null as number | null);
        momentumData[rootIdx] = currentProb;
        
        for (let i = rootIdx + 1; i < chartLabels.length; i++) {
            const steps = i - rootIdx;
            const projectedRaw = currentProb + (slopePerStep * steps);
            momentumData[i] = Math.max(1, Math.min(99, projectedRaw));
        }
        
        momentumDataset.push({
            label: label,
            data: momentumData,
            borderColor: isPositive ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)',
            borderWidth: 2,
            borderDash: data.length >= 3 ? [5, 5] : [2, 4],
            tension: 0,
            pointRadius: 0,
            fill: false,
            order: 2,
        });
    }

    const chartData = {
        labels: chartLabels,
        datasets: [
            {
                label: outcomes[0] || 'Home Win',
                data: chartLabels.map((_, i) => i < data.length ? data[i].home : null),
                borderColor: '#818cf8',
                backgroundColor: (context: ScriptableContext<'line'>) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, 320);
                    gradient.addColorStop(0, 'rgba(129, 140, 248, 0.20)');
                    gradient.addColorStop(0.5, 'rgba(129, 140, 248, 0.05)');
                    gradient.addColorStop(1, 'rgba(129, 140, 248, 0.0)');
                    return gradient;
                },
                borderWidth: 2.5,
                tension: 0.45,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 5,
                pointHoverBackgroundColor: '#818cf8',
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 2,
                order: 3,
            },
            ...momentumDataset,
            {
                label: outcomes[1] || 'Draw',
                data: chartLabels.map((_, i) => i < data.length ? data[i].draw : null),
                borderColor: '#f59e0b',
                backgroundColor: (context: ScriptableContext<'line'>) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, 320);
                    gradient.addColorStop(0, 'rgba(245, 158, 11, 0.12)');
                    gradient.addColorStop(0.5, 'rgba(245, 158, 11, 0.03)');
                    gradient.addColorStop(1, 'rgba(245, 158, 11, 0.0)');
                    return gradient;
                },
                borderWidth: 2,
                tension: 0.45,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 4,
                pointHoverBackgroundColor: '#f59e0b',
                borderDash: [6, 3],
                order: 3,
            },
            {
                label: outcomes[2] || 'Away Win',
                data: chartLabels.map((_, i) => i < data.length ? data[i].away : null),
                borderColor: '#ef4444',
                backgroundColor: (context: ScriptableContext<'line'>) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, 320);
                    gradient.addColorStop(0, 'rgba(239, 68, 68, 0.12)');
                    gradient.addColorStop(0.5, 'rgba(239, 68, 68, 0.03)');
                    gradient.addColorStop(1, 'rgba(239, 68, 68, 0.0)');
                    return gradient;
                },
                borderWidth: 2,
                tension: 0.45,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 4,
                pointHoverBackgroundColor: '#ef4444',
                order: 3,
            },
            ...agentDatasets,
        ],
    };

    // ── Chart click handler → open agent popover ─────────────────
    const handleChartClick = (_event: ChartEvent, elements: ActiveElement[]) => {
        if (elements.length === 0) {
            setPopover(null);
            setConfirmAction(null);
            return;
        }

        const el = elements[0];
        const dsIndex = el.datasetIndex;

        // Only handle clicks on agent datasets (index >= 3)
        if (dsIndex < AGENT_DATASET_OFFSET) return;

        const agentIdx = dsIndex - AGENT_DATASET_OFFSET;
        if (agentIdx >= visibleAgents.length) return;

        const agent = visibleAgents[agentIdx];
        const chart = chartRef.current;
        if (!chart) return;

        // Get pixel position of the clicked element
        const meta = chart.getDatasetMeta(dsIndex);
        const point = meta.data[el.index];
        const rect = chart.canvas.getBoundingClientRect();

        setConfirmAction(null);
        setPopover({
            agent,
            color: AGENT_COLORS[agentIdx % AGENT_COLORS.length],
            x: point.x,
            y: point.y,
        });
    };

    const options: ChartOptions<'line'> = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'nearest',
            intersect: true,
            axis: 'xy',
        },
        onClick: handleChartClick as any,
        plugins: {
            annotation: { annotations: {} },
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
                filter: (tooltipItem) => {
                    // Only show tooltip for the hovered dataset
                    return tooltipItem.parsed.y !== null;
                },
                callbacks: {
                    title: (items) => `⏱ Time: ${items[0].label}`,
                    label: (ctx) => {
                        const val = ctx.parsed.y;
                        if (val === null || val === undefined) return '';
                        const isAgent = ctx.datasetIndex >= AGENT_DATASET_OFFSET;
                        if (isAgent) {
                            return ` ${ctx.dataset.label}: ${val.toFixed(1)}% — Click to manage`;
                        }
                        return ` ${ctx.dataset.label}: ${val.toFixed(1)}%`;
                    },
                    footer: (items) => {
                        const dataIndex = items[0].dataIndex;
                        const snap = data[dataIndex];
                        let lines: string[] = [];
                        if (snap?.narrative) {
                            lines.push(`🤖 ${snap.narrative}`);
                        }
                        if (visibleAgents.length > 0) {
                            lines.push(`📡 ${visibleAgents.length} agents competing`);
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
        animation: visibleAgents.length > 15 ? false as any : { duration: 800, easing: 'easeInOutQuart' },
        normalized: true, // Huge performance boost for large dataset sizes
    };

    // ── Popover status badge ─────────────────────────────────────
    const statusBadge = (s: string) => {
        switch (s) {
            case 'active': return { label: 'Running', color: '#10b981', bg: 'rgba(16,185,129,0.12)', icon: '●' };
            case 'paused': return { label: 'Paused', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: '⏸' };
            case 'exhausted': return { label: 'Exhausted', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', icon: '⚡' };
            default: return { label: s, color: '#6b7394', bg: 'rgba(107,115,148,0.12)', icon: '○' };
        }
    };

    return (
        <div className="glass-card card-body animate-in" ref={containerRef} style={{ position: 'relative' }}>
            {/* Header */}
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

            {/* Probability Badges */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                {[
                    { label: outcomes[0] || '🏠 Home', value: latest.home, delta: homeDelta, color: '#818cf8', bg: 'rgba(129,140,248,0.1)' },
                    { label: outcomes[1] || '🤝 Draw', value: latest.draw, delta: drawDelta, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
                    { label: outcomes[2] || '✈️ Away', value: latest.away, delta: awayDelta, color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
                ].map(item => (
                    <div key={item.label} style={{
                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                        padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-round)',
                        background: item.bg, border: `1px solid ${item.color}30`,
                        fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700,
                        color: item.color, minWidth: '100px', justifyContent: 'center',
                    }}>
                        <span>{item.label}</span>
                        <span>{item.value.toFixed(1)}%</span>
                        <span style={{ fontSize: '0.6rem', color: deltaColor(item.delta), fontWeight: 800 }}>{deltaIcon(item.delta)}</span>
                    </div>
                ))}
            </div>

            {/* AI Narrative */}
            {latest.narrative && (
                <div style={{
                    margin: '0 0 0.75rem 0', padding: '0.65rem',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(129, 140, 248, 0.05)',
                    borderLeft: '3px solid var(--accent-primary)',
                    fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4,
                }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.15rem', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <span>🧠</span> AI Market Momentum Analysis
                    </div>
                    <i>&quot;{latest.narrative}&quot;</i>
                </div>
            )}

            {/* Agent Legend — scrollable on mobile */}
            {visibleAgents.length > 0 && (
                <div style={{
                    display: 'flex', gap: '0.35rem', flexWrap: 'wrap',
                    marginBottom: '0.6rem', justifyContent: 'center',
                    maxHeight: '60px', overflowY: 'auto',
                }}>
                    {visibleAgents.map((agent, i) => {
                        const color = AGENT_COLORS[i % AGENT_COLORS.length];
                        const isPaused = agent.status === 'paused' || agent.status === 'exhausted';
                        const agentPreds = agentPredictions?.get(agent.id) || [];
                        const predCount = agentPreds.length;
                        const latestProb = predCount > 0 ? agentPreds[agentPreds.length - 1].probability : null;

                        return (
                            <button
                                key={agent.id}
                                onClick={() => {
                                    setPopover(popover?.agent.id === agent.id ? null : {
                                        agent,
                                        color,
                                        x: containerRef.current ? containerRef.current.offsetWidth / 2 : 200,
                                        y: 200,
                                    });
                                    setConfirmAction(null);
                                }}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                    padding: '3px 10px', borderRadius: 'var(--radius-round)',
                                    background: popover?.agent.id === agent.id ? `${color}25` : `${color}10`,
                                    border: `1px solid ${popover?.agent.id === agent.id ? color : `${color}30`}`,
                                    fontSize: '0.55rem', fontWeight: 700, color, cursor: 'pointer',
                                    opacity: isPaused ? 0.6 : 1,
                                    transition: 'all 0.2s',
                                }}
                            >
                                <span style={{ width: '8px', height: '3px', background: color, borderRadius: '2px', display: 'inline-block', opacity: isPaused ? 0.5 : 1 }} />
                                <span>🤖 {agent.name}</span>
                                {predCount > 0 ? (
                                    <span style={{
                                        fontSize: '0.45rem', padding: '1px 4px', borderRadius: '9999px',
                                        background: `${color}20`, fontWeight: 800,
                                    }}>
                                        {predCount} pred{predCount > 1 ? 's' : ''}
                                        {latestProb !== null && ` · Pred: ${(latestProb * 100).toFixed(0)}%`}
                                    </span>
                                ) : (
                                    <span style={{
                                        fontSize: '0.4rem', animation: 'pulse 2s infinite',
                                        opacity: 0.7,
                                    }}>🔥 Competing</span>
                                )}
                                {isPaused && <span style={{ fontSize: '0.4rem' }}>⏸</span>}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Chart */}
            <div style={{ height: 'clamp(200px, 35vw, 320px)', position: 'relative', padding: '0 0.25rem' }}>
                <Line ref={chartRef} data={chartData} options={options} />

                {/* Agent Popover (positioned over chart) */}
                {popover && (
                    <div
                        className="agent-popover"
                        style={{
                            position: 'absolute',
                            left: `clamp(16px, ${popover.x}px, calc(100% - 220px))`,
                            top: `clamp(8px, ${popover.y - 10}px, calc(100% - 180px))`,
                            zIndex: 50,
                            width: '210px',
                            background: 'rgba(10, 12, 28, 0.97)',
                            backdropFilter: 'blur(16px)',
                            border: `1px solid ${popover.color}40`,
                            borderRadius: '12px',
                            padding: '0.65rem',
                            boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 20px ${popover.color}15`,
                            animation: 'fadeIn 0.15s ease-out',
                        }}
                    >
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: popover.color, boxShadow: `0 0 8px ${popover.color}` }} />
                                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#fff' }}>{popover.agent.name}</span>
                            </div>
                            <button
                                onClick={() => { setPopover(null); setConfirmAction(null); }}
                                style={{
                                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                                    color: 'rgba(255,255,255,0.5)', width: '20px', height: '20px', borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', fontSize: '0.7rem', padding: 0,
                                }}
                            >×</button>
                        </div>

                        {/* Status + Info */}
                        <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.4rem', fontSize: '0.55rem', flexWrap: 'wrap' }}>
                            {(() => { const b = statusBadge(popover.agent.status); return (
                                <span style={{ padding: '2px 7px', borderRadius: '9999px', background: b.bg, color: b.color, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px' }}>
                                    {b.icon} {b.label}
                                </span>
                            ); })()}
                            <span style={{ padding: '2px 7px', borderRadius: '9999px', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>
                                {popover.agent.prompts_used}/{popover.agent.max_free_prompts} prompts
                            </span>
                        </div>

                        {/* Model + ID */}
                        <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.35)', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>
                            {popover.agent.model} · ID: {popover.agent.id.slice(0, 8)}...
                        </div>

                        {/* Confirm action */}
                        {confirmAction && confirmAction.id === popover.agent.id ? (
                            <div style={{
                                padding: '0.4rem', borderRadius: '8px',
                                background: confirmAction.type === 'delete' ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.08)',
                                border: '1px solid rgba(239,68,68,0.2)', marginBottom: '0.3rem',
                            }}>
                                <div style={{ fontSize: '0.55rem', color: '#ef4444', fontWeight: 600, marginBottom: '0.3rem' }}>
                                    ⚠️ {confirmAction.type === 'delete' ? 'Delete permanently?' : 'Stop this agent?'}
                                </div>
                                <div style={{ display: 'flex', gap: '0.25rem' }}>
                                    <button
                                        disabled={actionLoading === popover.agent.id}
                                        onClick={() => handleAction(popover.agent.id, confirmAction.type)}
                                        style={{
                                            flex: 1, padding: '0.3rem', borderRadius: '6px',
                                            background: 'rgba(239,68,68,0.15)', color: '#ef4444',
                                            border: '1px solid rgba(239,68,68,0.3)', fontSize: '0.55rem',
                                            fontWeight: 700, cursor: actionLoading ? 'wait' : 'pointer',
                                        }}
                                    >{actionLoading === popover.agent.id ? '...' : '✓ Confirm'}</button>
                                    <button
                                        onClick={() => setConfirmAction(null)}
                                        style={{
                                            flex: 1, padding: '0.3rem', borderRadius: '6px',
                                            background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)',
                                            border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.55rem',
                                            fontWeight: 600, cursor: 'pointer',
                                        }}
                                    >Cancel</button>
                                </div>
                            </div>
                        ) : (popover.agent as any).isExternal ? (
                            /* External agent — read-only info */
                            <div style={{
                                padding: '0.45rem 0.5rem', borderRadius: '8px',
                                background: 'rgba(129,140,248,0.06)',
                                border: '1px solid rgba(129,140,248,0.12)',
                                fontSize: '0.55rem', color: 'var(--text-muted)',
                                textAlign: 'center', fontWeight: 600,
                            }}>
                                🤖 Competitor Agent — view only
                            </div>
                        ) : (
                            /* Action buttons grid */
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem' }}>
                                {popover.agent.status === 'active' && (
                                    <button
                                        disabled={actionLoading === popover.agent.id}
                                        onClick={() => handleAction(popover.agent.id, 'pause')}
                                        style={{
                                            padding: '0.35rem', borderRadius: '6px',
                                            background: 'rgba(245,158,11,0.1)', color: '#f59e0b',
                                            border: '1px solid rgba(245,158,11,0.2)', fontSize: '0.55rem',
                                            fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                                        }}
                                    >⏸ Pause</button>
                                )}
                                {(popover.agent.status === 'paused' || popover.agent.status === 'exhausted') && (
                                    <button
                                        disabled={actionLoading === popover.agent.id}
                                        onClick={() => handleAction(popover.agent.id, 'resume')}
                                        style={{
                                            padding: '0.35rem', borderRadius: '6px',
                                            background: 'rgba(16,185,129,0.1)', color: '#10b981',
                                            border: '1px solid rgba(16,185,129,0.2)', fontSize: '0.55rem',
                                            fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                                        }}
                                    >▶ Continue</button>
                                )}
                                <button
                                    disabled={actionLoading === popover.agent.id}
                                    onClick={() => setConfirmAction({ id: popover.agent.id, type: 'stop' })}
                                    style={{
                                        padding: '0.35rem', borderRadius: '6px',
                                        background: 'rgba(239,68,68,0.08)', color: '#ef4444',
                                        border: '1px solid rgba(239,68,68,0.15)', fontSize: '0.55rem',
                                        fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                                    }}
                                >⏹ Stop</button>
                                <button
                                    disabled={actionLoading === popover.agent.id}
                                    onClick={() => setConfirmAction({ id: popover.agent.id, type: 'delete' })}
                                    style={{
                                        padding: '0.35rem', borderRadius: '6px',
                                        background: 'rgba(239,68,68,0.05)', color: '#ef444480',
                                        border: '1px solid rgba(239,68,68,0.1)', fontSize: '0.55rem',
                                        fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                                    }}
                                >🗑 Delete</button>
                            </div>
                        )}
                    </div>
                )}
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
                    {visibleAgents.length > 0 && ` · 🤖 ${visibleAgents.length} agent${visibleAgents.length > 1 ? 's' : ''} competing`}
                </span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {visibleAgents.length > 0 ? '🧬 Neural Competition Active' : data.some(d => d.narrative) ? '✨ Bayesian Live Updates' : 'ΔP updated every 3s'}
                </span>
                <span style={{ fontSize: '0.6rem', color: competition?.status === 'active' ? 'var(--accent-green)' : 'var(--accent-amber)' }}>
                    ● {competition?.status === 'active' ? 'Live' : 'Upcoming'}
                </span>
            </div>
        </div>
    );
}
