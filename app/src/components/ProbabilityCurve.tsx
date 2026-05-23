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

// Helper to get deterministic random noise in the range [-1, 1]
function getDeterministicNoise(seed: string, index: number): number {
    const str = `${seed}-${index}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return ((Math.abs(hash) % 2000) - 1000) / 1000;
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
    chartTimeSecs: number[],
    predictions: AgentPrediction[],
    baseData: (number | null)[],
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
        return chartTimeSecs.map((_, i) => getTrackingPoint(i, baseData[i] || 50));
    }

    // 2. Map actual predictions + their projected curves by exact seconds (absolute Unix timestamp)
    const predPoints: { sec: number; prob: number }[] = [];

    for (const pred of predictions) {
        const predTime = new Date(pred.timestamp);
        const baseSec = Math.floor(predTime.getTime() / 1000);
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

    // 3. Build the chart array by matching chartTimeSecs to closest prediction seconds
    const result: (number | null)[] = chartTimeSecs.map(() => null);

    let firstPredIdx = -1;
    let lastPredIdx = -1;

    // For each known prediction point, find the absolute closest chart time 
    for (const pt of predPoints) {
        let bestIdx = -1;
        let minDiff = Infinity;

        for (let i = 0; i < chartTimeSecs.length; i++) {
            const diff = Math.abs(chartTimeSecs[i] - pt.sec);
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
        for (let i = lastPredIdx + 1; i < chartTimeSecs.length; i++) {
            result[i] = getTrackingPoint(i, result[lastPredIdx]!);
        }
    } else {
        // Failsafe if absolutely no predictions matched
        return chartTimeSecs.map((_, i) => getTrackingPoint(i, baseData[i] || 50));
    }

    return result;
}

// ── Build absolute true data trajectory line (straight, no jitter) ──
function buildTrueAgentCurve(
    chartTimeSecs: number[],
    predictions: AgentPrediction[],
): (number | null)[] {
    if (!predictions || predictions.length === 0) {
        return chartTimeSecs.map(() => null);
    }

    const predPoints: { sec: number; prob: number }[] = [];

    for (const pred of predictions) {
        const predTime = new Date(pred.timestamp);
        const baseSec = Math.floor(predTime.getTime() / 1000);
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

    const result: (number | null)[] = chartTimeSecs.map(() => null);

    for (const pt of predPoints) {
        let bestIdx = -1;
        let minDiff = Infinity;

        for (let i = 0; i < chartTimeSecs.length; i++) {
            const diff = Math.abs(chartTimeSecs[i] - pt.sec);
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

    // ── Build timeline spanning the entire competition duration ──
    const startTime = competition 
        ? new Date(competition.competition_start).getTime() 
        : (data.length > 0 
            ? data[0].timestamp * 1000 
            : Date.now() - 3600 * 1000);
            
    const endTime = competition 
        ? new Date(competition.competition_end).getTime() 
        : (data.length > 0 
            ? data[data.length - 1].timestamp * 1000 
            : Date.now());
            
    const totalDuration = (endTime - startTime) / 1000; // in seconds
    // Choose step size dynamically to target ~150 points for detail and performance
    const step = Math.max(15, Math.ceil(totalDuration / 150));
    
    const chartLabels: string[] = [];
    const chartTimeSecs: number[] = [];
    const mappedNarratives: (string | null)[] = [];
    
    const startSec = Math.floor(startTime / 1000);
    const endSec = Math.floor(endTime / 1000);
    const nowSec = Math.floor(Date.now() / 1000);
    
    // Project up to competition end, or cap at now + 30 mins (1800s) if the competition extends far beyond
    const maxTimelineSec = Math.min(endSec, nowSec + 1800);
    
    for (let sec = startSec; sec <= maxTimelineSec; sec += step) {
        chartTimeSecs.push(sec);
        const d = new Date(sec * 1000);
        chartLabels.push(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        mappedNarratives.push(null);
    }
    
    // Ensure the last timestamp is always included
    if (chartTimeSecs.length === 0 || chartTimeSecs[chartTimeSecs.length - 1] < maxTimelineSec) {
        chartTimeSecs.push(maxTimelineSec);
        const d = new Date(maxTimelineSec * 1000);
        chartLabels.push(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        mappedNarratives.push(null);
    }
    
    // Find index of current time in the timeline
    let nowIntervalIdx = chartTimeSecs.length - 1;
    for (let i = 0; i < chartTimeSecs.length; i++) {
        if (chartTimeSecs[i] >= nowSec) {
            nowIntervalIdx = i;
            break;
        }
    }

    const mappedHomeData: (number | null)[] = chartLabels.map(() => null);
    const mappedDrawData: (number | null)[] = chartLabels.map(() => null);
    const mappedAwayData: (number | null)[] = chartLabels.map(() => null);
    
    // Map raw database points to the closest timeline seconds
    for (const snap of data) {
        const snapSec = snap.timestamp;
        let closestIdx = 0;
        let minDiff = Infinity;
        for (let i = 0; i < chartTimeSecs.length; i++) {
            const diff = Math.abs(chartTimeSecs[i] - snapSec);
            if (diff < minDiff) {
                minDiff = diff;
                closestIdx = i;
            }
        }
        
        if (minDiff < step * 1.5) {
            mappedHomeData[closestIdx] = snap.home;
            mappedDrawData[closestIdx] = snap.draw;
            mappedAwayData[closestIdx] = snap.away;
            if (snap.narrative) {
                mappedNarratives[closestIdx] = snap.narrative;
            }
        }
    }

    // Fill missing gaps in history up to nowIntervalIdx
    const knownPoints: { idx: number; home: number; draw: number; away: number }[] = [];
    if (mappedHomeData[0] === null && data.length > 0) {
        let firstMappedIdx = -1;
        for (let i = 0; i <= nowIntervalIdx; i++) {
            if (mappedHomeData[i] !== null) {
                firstMappedIdx = i;
                break;
            }
        }
        if (firstMappedIdx !== -1) {
            knownPoints.push({
                idx: 0,
                home: mappedHomeData[firstMappedIdx]!,
                draw: mappedDrawData[firstMappedIdx]!,
                away: mappedAwayData[firstMappedIdx]!
            });
        } else {
            knownPoints.push({
                idx: 0,
                home: data[0].home,
                draw: data[0].draw,
                away: data[0].away
            });
        }
    }

    for (let i = 0; i <= nowIntervalIdx; i++) {
        if (mappedHomeData[i] !== null) {
            knownPoints.push({
                idx: i,
                home: mappedHomeData[i]!,
                draw: mappedDrawData[i]!,
                away: mappedAwayData[i]!
            });
        }
    }

    if (knownPoints.length > 0) {
        knownPoints.sort((a, b) => a.idx - b.idx);
        
const firstPoint = knownPoints[0];
        let currentHome = firstPoint.home;
        let currentDraw = firstPoint.draw;
        for (let i = firstPoint.idx - 1; i >= 0; i--) {
            const noiseH = getDeterministicNoise(competition?.id || '', i) * 1.4;
            const noiseD = getDeterministicNoise((competition?.id || '') + '-draw', i) * 0.5;
            currentHome += noiseH;
            currentDraw += noiseD;
            currentHome = Math.max(10, Math.min(90, currentHome));
            currentDraw = Math.max(5, Math.min(45, currentDraw));
            mappedHomeData[i] = currentHome;
            mappedDrawData[i] = currentDraw;
            mappedAwayData[i] = 100 - currentHome - currentDraw;
        }
        
        for (let k = 0; k < knownPoints.length - 1; k++) {
            const pStart = knownPoints[k];
            const pEnd = knownPoints[k + 1];
            const range = pEnd.idx - pStart.idx;
            
            mappedHomeData[pStart.idx] = pStart.home;
            mappedDrawData[pStart.idx] = pStart.draw;
            mappedAwayData[pStart.idx] = pStart.away;
            mappedHomeData[pEnd.idx] = pEnd.home;
            mappedDrawData[pEnd.idx] = pEnd.draw;
            mappedAwayData[pEnd.idx] = pEnd.away;
            
            if (range > 1) {
                const W_H: number[] = [0];
                const W_D: number[] = [0];
                let cumH = 0;
                let cumD = 0;
                for (let step = 1; step <= range; step++) {
                    const idx = pStart.idx + step;
                    cumH += getDeterministicNoise(competition?.id || '', idx);
                    cumD += getDeterministicNoise((competition?.id || '') + '-draw', idx);
                    W_H.push(cumH);
                    W_D.push(cumD);
                }
                
                const volH = Math.min(12, Math.sqrt(range) * 1.4);
                const volD = Math.min(6, Math.sqrt(range) * 0.6);
                
                for (let i = pStart.idx + 1; i < pEnd.idx; i++) {
                    const stepIdx = i - pStart.idx;
                    const t = stepIdx / range;
                    const bridgeH = W_H[stepIdx] - t * W_H[range];
                    const bridgeD = W_D[stepIdx] - t * W_D[range];
                    
                    const hVal = pStart.home + t * (pEnd.home - pStart.home) + bridgeH * volH;
                    const dVal = pStart.draw + t * (pEnd.draw - pStart.draw) + bridgeD * volD;
                    const aVal = 100 - hVal - dVal;
                    
                    mappedHomeData[i] = Math.max(5, Math.min(95, hVal));
                    mappedDrawData[i] = Math.max(2, Math.min(45, dVal));
                    mappedAwayData[i] = Math.max(5, Math.min(95, aVal));
                }
            }
        }
        
        const lastPoint = knownPoints[knownPoints.length - 1];
        let currentHomeLast = lastPoint.home;
        let currentDrawLast = lastPoint.draw;
        for (let i = lastPoint.idx + 1; i <= nowIntervalIdx; i++) {
            const noiseH = getDeterministicNoise(competition?.id || '', i) * 1.4;
            const noiseD = getDeterministicNoise((competition?.id || '') + '-draw', i) * 0.5;
            currentHomeLast += noiseH;
            currentDrawLast += noiseD;
            currentHomeLast = Math.max(10, Math.min(90, currentHomeLast));
            currentDrawLast = Math.max(5, Math.min(45, currentDrawLast));
            mappedHomeData[i] = currentHomeLast;
            mappedDrawData[i] = currentDrawLast;
            mappedAwayData[i] = 100 - currentHomeLast - currentDrawLast;
        }
    }

    // Apply EMA smoothing to mapped points
    const EMA_ALPHA = 0.75; // Increased to 0.75 for sharper transitions matching sentiment shocks
    const smoothedHomeData: (number | null)[] = [];
    const smoothedDrawData: (number | null)[] = [];
    const smoothedAwayData: (number | null)[] = [];

    if (chartTimeSecs.length > 0) {
        let currHome = mappedHomeData[0] || 50;
        let currDraw = mappedDrawData[0] || 25;
        let currAway = mappedAwayData[0] || 25;
        
        for (let i = 0; i < chartTimeSecs.length; i++) {
            if (i <= nowIntervalIdx) {
                const isRecent = i >= nowIntervalIdx - 2;
                const alpha = isRecent ? 1.0 : EMA_ALPHA;
                
                currHome = currHome + alpha * ((mappedHomeData[i] ?? currHome) - currHome);
                currDraw = currDraw + alpha * ((mappedDrawData[i] ?? currDraw) - currDraw);
                currAway = currAway + alpha * ((mappedAwayData[i] ?? currAway) - currAway);
                
                smoothedHomeData.push(currHome);
                smoothedDrawData.push(currDraw);
                smoothedAwayData.push(currAway);
            } else {
                smoothedHomeData.push(null);
                smoothedDrawData.push(null);
                smoothedAwayData.push(null);
            }
        }
    }

    const baseHomeData = smoothedHomeData.map(val => val ?? 50);

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
        return '24H';
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
    const AGENT_DATASET_OFFSET = 3;

    const agentDatasets = visibleAgents.flatMap((agent, idx) => {
        // Generate a distinct neon color from the agent's ID hash for infinite scale
        const h = Math.abs(hashString(agent.id));
        const color = `hsl(${h % 360}, 85%, 65%)`;

        const isPaused = agent.status === 'paused' || agent.status === 'exhausted';
        const isMassive = visibleAgents.length > 15; // Enable performance scaling

        // Use real prediction data if available, otherwise show tracking curve
        const agentPreds = agentPredictions?.get(agent.id) || [];
        const curveData = buildRealAgentCurve(chartTimeSecs, agentPreds, baseHomeData, agent.name, idx);
        const trueData = buildTrueAgentCurve(chartTimeSecs, agentPreds);
        const hasPredictions = agentPreds.length > 0;

        const mainDataset = {
            label: `🤖 ${agent.name}${hasPredictions ? ` (${agentPreds.length} preds · Pred: ${agentPreds[agentPreds.length - 1].probability * 100}%)` : ' 🔥 Competing'}`,
            data: curveData,
            borderColor: isPaused ? color.replace(')', ', 0.4)').replace('hsl', 'hsla') : color,
            backgroundColor: 'transparent',
            borderWidth: isMassive ? 0.8 : (isPaused ? 1.5 : hasPredictions ? 2.5 : 2),
            tension: 0.05, // Professional financial sharp rendering
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
    if (chartTimeSecs.length > 0 && nowIntervalIdx < chartTimeSecs.length - 1) {
        const rootIdx = nowIntervalIdx;
        const currentProb = smoothedHomeData[rootIdx] || 50;

        let slopePerStep = 0;
        let label = "Status Quo Baseline";
        let isPositive = true;

        // Calculate slope based on the last few smoothed historical points
        const lookback = Math.min(rootIdx + 1, 5);
        if (lookback >= 3) {
            const p1 = smoothedHomeData[rootIdx - lookback + 1] || 50;
            const p2 = currentProb;
            const slope = (p2 - p1) / (lookback - 1);
            slopePerStep = slope * 0.5; // Initial momentum force
            label = "🚀 Market Momentum";
            isPositive = slope >= 0;
        }

        const momentumData = chartLabels.map(() => null as number | null);
        momentumData[rootIdx] = currentProb;

        let projectedValue = currentProb;
        for (let i = rootIdx + 1; i < chartLabels.length; i++) {
            // Apply exponential decay to the slope to create a natural asymptotic curve
            slopePerStep *= 0.90;
            projectedValue += slopePerStep;
            momentumData[i] = Math.max(1, Math.min(99, projectedValue));
        }

        momentumDataset.push({
            label: label,
            data: momentumData,
            borderColor: isPositive ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.6)',
            borderWidth: 2,
            borderDash: [6, 4],
            tension: 0.05, // sharper momentum line
            pointRadius: 0,
            fill: false,
            order: 2,
        });
    }

    // Determine overall trend direction for the gradient fill
    const overallTrendUp = smoothedHomeData.length >= 2
        ? (smoothedHomeData[nowIntervalIdx] || 50) >= (smoothedHomeData[Math.max(0, nowIntervalIdx - 4)] || 50)
        : true;

    const chartData = {
        labels: chartLabels,
        datasets: [
            {
                label: outcomes[0] || 'Home Win',
                data: chartLabels.map((_, i) => i <= nowIntervalIdx ? smoothedHomeData[i] : null),
                borderColor: '#818cf8', // Set dynamic border color fallback to prevent default blue
                segment: {
                    borderColor: (ctx: any) => {
                        if (!ctx.p0 || !ctx.p1) return overallTrendUp ? '#10b981' : '#ef4444';
                        const prev = ctx.p0.parsed.y;
                        const curr = ctx.p1.parsed.y;
                        if (Math.abs(curr - prev) < 0.02) {
                            return overallTrendUp ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)';
                        }
                        return curr > prev ? '#10b981' : '#ef4444';
                    }
                },
                backgroundColor: (context: ScriptableContext<'line'>) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, 350);
                    if (overallTrendUp) {
                        gradient.addColorStop(0, 'rgba(16, 185, 129, 0.28)');
                        gradient.addColorStop(0.4, 'rgba(16, 185, 129, 0.08)');
                        gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
                    } else {
                        gradient.addColorStop(0, 'rgba(239, 68, 68, 0.28)');
                        gradient.addColorStop(0.4, 'rgba(239, 68, 68, 0.08)');
                        gradient.addColorStop(1, 'rgba(239, 68, 68, 0.0)');
                    }
                    return gradient;
                },
                borderWidth: 2.5,
                tension: 0.05, // Professional financial sharp rendering
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: overallTrendUp ? '#10b981' : '#ef4444',
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 2,
                order: 3,
            },
            ...momentumDataset,
            ...(outcomes.length > 2 ? [{
                label: outcomes[1] || 'Draw',
                data: chartLabels.map((_, i) => i <= nowIntervalIdx ? smoothedDrawData[i] : null),
                borderColor: '#f59e0b',
                segment: {
                    borderColor: (ctx: any) => {
                        if (!ctx.p0 || !ctx.p1) return '#f59e0b';
                        const prev = ctx.p0.parsed.y;
                        const curr = ctx.p1.parsed.y;
                        if (Math.abs(curr - prev) < 0.02) return 'rgba(245,158,11,0.6)';
                        return curr > prev ? '#10b981' : '#ef4444';
                    }
                },
                backgroundColor: (context: ScriptableContext<'line'>) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, 320);
                    gradient.addColorStop(0, 'rgba(245, 158, 11, 0.12)');
                    gradient.addColorStop(0.5, 'rgba(245, 158, 11, 0.03)');
                    gradient.addColorStop(1, 'rgba(245, 158, 11, 0.0)');
                    return gradient;
                },
                borderWidth: 1.8,
                tension: 0.05, // Professional financial sharp rendering
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 4,
                pointHoverBackgroundColor: '#f59e0b',
                borderDash: [6, 3],
                order: 3,
            }] : []),
            ...(outcomes.length > 2 ? [{
                label: outcomes[2] || 'Away Win',
                data: chartLabels.map((_, i) => i <= nowIntervalIdx ? smoothedAwayData[i] : null),
                borderColor: '#ef4444',
                segment: {
                    borderColor: (ctx: any) => {
                        if (!ctx.p0 || !ctx.p1) return '#ef4444';
                        const prev = ctx.p0.parsed.y;
                        const curr = ctx.p1.parsed.y;
                        if (Math.abs(curr - prev) < 0.02) return 'rgba(239,68,68,0.6)';
                        return curr > prev ? '#10b981' : '#ef4444';
                    }
                },
                backgroundColor: (context: ScriptableContext<'line'>) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, 320);
                    gradient.addColorStop(0, 'rgba(239, 68, 68, 0.12)');
                    gradient.addColorStop(0.5, 'rgba(239, 68, 68, 0.03)');
                    gradient.addColorStop(1, 'rgba(239, 68, 68, 0.0)');
                    return gradient;
                },
                borderWidth: 1.8,
                tension: 0.05, // Professional financial sharp rendering
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 4,
                pointHoverBackgroundColor: '#ef4444',
                order: 3,
            }] : []),
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
                        const narrative = mappedNarratives[dataIndex];
                        let lines: string[] = [];
                        if (narrative) {
                            lines.push(`🤖 ${narrative}`);
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
                ticks: { color: 'rgba(107, 115, 148, 0.5)', font: { size: 9, family: 'JetBrains Mono' }, callback: (val) => `${val}%`, padding: 8, stepSize: 20 },
                min: 0,
                max: 100,
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
            <div style={{ textAlign: 'center', marginBottom: '1.25rem', padding: '0 1rem' }}>
                <div style={{
                    fontSize: '1.35rem',
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                    background: 'linear-gradient(to right, var(--text-primary), var(--accent-indigo))',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    marginBottom: '0.2rem'
                }}>
                    {teamHome && teamAway ? `${teamHome} vs ${teamAway}` : title}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.02em' }}>
                    {sector.charAt(0).toUpperCase() + sector.slice(1)} <span style={{ opacity: 0.5 }}>•</span> {competition?.status === 'active' ? 'Live' : competition?.status === 'settled' ? 'Ended' : 'Upcoming'} <span style={{ opacity: 0.5 }}>•</span> Realtime Analysis
                </div>
            </div>

            {/* Probability Badges */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                {[
                    { label: outcomes[0] || '🏠 Home', value: latest.home, delta: homeDelta, color: '#818cf8', bg: 'rgba(129,140,248,0.1)' },
                    { label: outcomes[1] || '🤝 Draw', value: latest.draw, delta: drawDelta, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
                    ...(outcomes.length > 2 ? [{ label: outcomes[2] || '✈️ Away', value: latest.away, delta: awayDelta, color: '#ef4444', bg: 'rgba(239,68,68,0.1)' }] : [])
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
                            {(() => {
                                const b = statusBadge(popover.agent.status); return (
                                    <span style={{ padding: '2px 7px', borderRadius: '9999px', background: b.bg, color: b.color, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px' }}>
                                        {b.icon} {b.label}
                                    </span>
                                );
                            })()}
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
