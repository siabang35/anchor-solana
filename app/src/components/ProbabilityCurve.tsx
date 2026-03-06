'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
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
import {
    generateInitialProbabilities,
    simulateProbShift,
    ProbabilityPoint,
    nlpEngine,
} from '@/lib/dummy-data';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface Props {
    onProbUpdate?: (prob: ProbabilityPoint) => void;
}

export default function ProbabilityCurve({ onProbUpdate }: Props) {
    const [data, setData] = useState<ProbabilityPoint[]>(generateInitialProbabilities());
    const chartRef = useRef<any>(null);

    useEffect(() => {
        const interval = setInterval(() => {
            setData((prev) => {
                const last = prev[prev.length - 1];
                const next = simulateProbShift(last);
                const updated = [...prev.slice(-40), next];
                onProbUpdate?.(next);
                return updated;
            });
        }, 3000);
        return () => clearInterval(interval);
    }, [onProbUpdate]);

    const latest = data[data.length - 1];
    const prev = data.length > 2 ? data[data.length - 3] : latest;

    const homeDelta = latest.home - prev.home;
    const drawDelta = latest.draw - prev.draw;
    const awayDelta = latest.away - prev.away;

    const deltaIcon = (d: number) => d > 0.3 ? '▲' : d < -0.3 ? '▼' : '—';
    const deltaColor = (d: number) => d > 0.3 ? 'var(--accent-green)' : d < -0.3 ? 'var(--accent-red)' : 'var(--text-muted)';

    // Gradient fill factory
    const createGradient = useCallback((ctx: CanvasRenderingContext2D, color: string, alpha1: number, alpha2: number) => {
        const gradient = ctx.createLinearGradient(0, 0, 0, 320);
        gradient.addColorStop(0, color.replace('1)', `${alpha1})`).replace('rgb', 'rgba'));
        gradient.addColorStop(1, color.replace('1)', `${alpha2})`).replace('rgb', 'rgba'));
        return gradient;
    }, []);

    const chartData = {
        labels: data.map((d) => d.time),
        datasets: [
            {
                label: 'Home Win',
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
                label: 'Draw',
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
                label: 'Away Win',
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
                    footer: () => 'NLP Pipeline → Bayesian Engine',
                },
            },
        },
        scales: {
            x: {
                grid: {
                    color: 'rgba(99, 102, 241, 0.04)',
                    drawTicks: false,
                },
                border: { display: false },
                ticks: {
                    color: 'rgba(107, 115, 148, 0.5)',
                    font: { size: 9, family: 'JetBrains Mono' },
                    maxTicksLimit: 8,
                    padding: 8,
                },
            },
            y: {
                grid: {
                    color: 'rgba(99, 102, 241, 0.04)',
                    drawTicks: false,
                },
                border: { display: false },
                ticks: {
                    color: 'rgba(107, 115, 148, 0.5)',
                    font: { size: 9, family: 'JetBrains Mono' },
                    callback: (val) => `${val}%`,
                    padding: 8,
                    stepSize: 10,
                },
                min: 5,
                max: 70,
            },
        },
        animation: {
            duration: 800,
            easing: 'easeInOutQuart',
        },
    };

    return (
        <div className="glass-card card-body animate-in">
            <div className="section-header">
                <h3 className="section-title"><span className="icon">📊</span> Live Probability Curve</h3>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    NLP → Bayesian Engine
                </span>
            </div>

            {/* Match Title */}
            <div style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.01em' }}>
                    Manchester United vs Liverpool
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    Premier League · Match Outcome · Real-time NLP Analysis
                </div>
            </div>

            {/* Probability Badges with Delta */}
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '0.5rem',
                marginBottom: '1rem',
                flexWrap: 'wrap',
            }}>
                {[
                    { label: '🏠 Home', value: latest.home, delta: homeDelta, color: '#818cf8', bg: 'rgba(129,140,248,0.1)' },
                    { label: '🤝 Draw', value: latest.draw, delta: drawDelta, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
                    { label: '✈️ Away', value: latest.away, delta: awayDelta, color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
                ].map((item) => (
                    <div
                        key={item.label}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            padding: '0.4rem 0.8rem',
                            borderRadius: 'var(--radius-round)',
                            background: item.bg,
                            border: `1px solid ${item.color}30`,
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            color: item.color,
                            minWidth: '110px',
                            justifyContent: 'center',
                        }}
                    >
                        <span>{item.label}</span>
                        <span>{item.value.toFixed(1)}%</span>
                        <span style={{
                            fontSize: '0.6rem',
                            color: deltaColor(item.delta),
                            fontWeight: 800,
                        }}>
                            {deltaIcon(item.delta)}
                        </span>
                    </div>
                ))}
            </div>

            {/* Chart */}
            <div style={{
                height: 'clamp(200px, 35vw, 320px)',
                position: 'relative',
                padding: '0 0.25rem',
            }}>
                <Line ref={chartRef} data={chartData} options={options} />
            </div>

            {/* Pipeline info bar */}
            <div style={{
                marginTop: '0.75rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-xs)',
                background: 'var(--gradient-card)',
                border: '1px solid var(--border-card)',
                flexWrap: 'wrap',
                gap: '0.3rem',
            }}>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                    📡 4 data sources active
                </span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    ΔP updated every 3s
                </span>
                <span style={{ fontSize: '0.6rem', color: 'var(--accent-green)' }}>
                    ● Engine Online
                </span>
            </div>
        </div>
    );
}
