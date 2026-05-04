'use client';

import React from 'react';
import { useSectorPool } from '@/hooks/usePool';

const SECTOR_COLORS: Record<string, string> = {
    politics: '#818cf8',
    finance: '#10b981',
    crypto: '#f59e0b',
    tech: '#6366f1',
    economy: '#14b8a6',
    science: '#8b5cf6',
    sports: '#ef4444',
};

const RANK_CONFIG = [
    { emoji: '🥇', label: '1st Place', gradient: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)', glow: 'rgba(251,191,36,0.3)', color: '#fbbf24' },
    { emoji: '🥈', label: '2nd Place', gradient: 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)', glow: 'rgba(148,163,184,0.25)', color: '#94a3b8' },
    { emoji: '🥉', label: '3rd Place', gradient: 'linear-gradient(135deg, #cd7f32 0%, #a0522d 100%)', glow: 'rgba(205,127,50,0.25)', color: '#cd7f32' },
];

interface Props {
    sector: string;
}

export default function CategoryPoolWinners({ sector }: Props) {
    const { pool, winners, loading } = useSectorPool(sector);
    const sectorColor = SECTOR_COLORS[sector] || '#818cf8';
    const sectorLabel = sector.charAt(0).toUpperCase() + sector.slice(1);

    return (
        <div className="glass-card animate-in" style={{ overflow: 'hidden' }}>
            {/* Header with gradient accent */}
            <div style={{
                padding: '1rem 1.25rem 0.75rem',
                borderBottom: '1px solid var(--border-glass)',
                background: `linear-gradient(135deg, ${sectorColor}08 0%, transparent 100%)`,
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{
                        fontSize: '0.9rem', fontWeight: 800, margin: 0,
                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                        color: 'var(--text-primary)',
                    }}>
                        <span>🏆</span> {sectorLabel} Market Pool
                    </h3>
                    <span style={{
                        fontSize: '0.5rem', fontWeight: 700, padding: '2px 8px',
                        borderRadius: '9999px',
                        background: `${sectorColor}15`, color: sectorColor,
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                        {pool.active_competitions || 0} Active
                    </span>
                </div>
            </div>

            <div style={{ padding: '1rem 1.25rem' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        <div style={{ animation: 'pulse 1.5s infinite', fontSize: '1.2rem', marginBottom: '0.3rem' }}>💎</div>
                        Loading pool data...
                    </div>
                ) : (
                    <>
                        {/* Pool Amount - Hero Display */}
                        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                            <div style={{
                                fontSize: '2rem', fontWeight: 900,
                                fontFamily: 'var(--font-mono)',
                                background: `linear-gradient(135deg, ${sectorColor}, ${sectorColor}99)`,
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                letterSpacing: '-0.02em',
                                lineHeight: 1.1,
                            }}>
                                {Number(pool.total_pool || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} SOL
                            </div>
                            <div style={{
                                fontSize: '0.6rem', color: 'var(--text-muted)',
                                marginTop: '0.25rem', letterSpacing: '0.04em',
                            }}>
                                DISTRIBUTABLE PRIZE POOL
                            </div>
                        </div>

                        {/* Pool Bar */}
                        <div style={{
                            height: '4px', borderRadius: '2px',
                            background: 'var(--border-glass)', overflow: 'hidden',
                            marginBottom: '0.75rem',
                        }}>
                            <div style={{
                                height: '100%',
                                width: pool.settled_competitions && pool.competition_count
                                    ? `${(pool.settled_competitions / pool.competition_count) * 100}%`
                                    : '0%',
                                borderRadius: '2px',
                                background: `linear-gradient(90deg, ${sectorColor}, ${sectorColor}99)`,
                                transition: 'width 1s ease',
                            }} />
                        </div>

                        {/* Stats Grid */}
                        <div style={{
                            display: 'grid', gridTemplateColumns: '1fr 1fr',
                            gap: '0.5rem', marginBottom: '1rem',
                        }}>
                            <div style={{ padding: '0.5rem', borderRadius: '10px', background: 'var(--bg-input)', border: '1px solid var(--border-card)' }}>
                                <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '2px' }}>Participants</div>
                                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: sectorColor, fontFamily: 'var(--font-mono)' }}>
                                    {pool.total_participants || 0}
                                </div>
                            </div>
                            <div style={{ padding: '0.5rem', borderRadius: '10px', background: 'var(--bg-input)', border: '1px solid var(--border-card)' }}>
                                <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '2px' }}>Competitions</div>
                                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                                    {pool.competition_count || 0}
                                </div>
                            </div>
                        </div>

                        {/* Winners Podium */}
                        <div style={{
                            borderTop: '1px solid var(--border-glass)',
                            paddingTop: '0.75rem',
                        }}>
                            <div style={{
                                fontSize: '0.55rem', fontWeight: 700, color: 'var(--text-muted)',
                                textTransform: 'uppercase', letterSpacing: '0.06em',
                                marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem',
                            }}>
                                🏅 Top Winners
                            </div>

                            {winners.length === 0 ? (
                                <div style={{
                                    textAlign: 'center', padding: '1rem',
                                    borderRadius: '10px', border: '1px dashed var(--border-glass)',
                                    background: 'var(--bg-input)',
                                }}>
                                    <div style={{ fontSize: '1rem', marginBottom: '0.2rem' }}>🤖</div>
                                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                                        No winners yet — compete to claim the pool!
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    {winners.slice(0, 3).map((winner, i) => {
                                        const cfg = RANK_CONFIG[i] || RANK_CONFIG[2];
                                        return (
                                            <div key={winner.agent_id} style={{
                                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                padding: '0.5rem 0.6rem', borderRadius: '10px',
                                                background: i === 0 ? `${cfg.color}08` : 'transparent',
                                                border: `1px solid ${i === 0 ? `${cfg.color}20` : 'var(--border-card)'}`,
                                                transition: 'all 0.3s ease',
                                            }}>
                                                {/* Rank Badge */}
                                                <div style={{
                                                    width: '28px', height: '28px', borderRadius: '8px',
                                                    background: cfg.gradient,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: '0.7rem', flexShrink: 0,
                                                    boxShadow: `0 2px 8px ${cfg.glow}`,
                                                }}>
                                                    {cfg.emoji}
                                                </div>

                                                {/* Agent Info */}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{
                                                        fontSize: '0.65rem', fontWeight: 700,
                                                        color: 'var(--text-primary)',
                                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                    }}>
                                                        {winner.agent_name}
                                                    </div>
                                                    <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                                                        <span>{winner.prediction_count} preds</span>
                                                        <span>·</span>
                                                        <span style={{ color: '#10b981', fontWeight: 700 }}>{winner.final_accuracy?.toFixed(1) || '0.0'}%</span>
                                                    </div>
                                                </div>

                                                {/* Prize */}
                                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                    <div style={{
                                                        fontSize: '0.7rem', fontWeight: 800,
                                                        fontFamily: 'var(--font-mono)',
                                                        color: cfg.color,
                                                    }}>
                                                        {Number(winner.prize_amount || 0).toFixed(2)}
                                                    </div>
                                                    <div style={{ fontSize: '0.45rem', color: 'var(--text-muted)' }}>SOL</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div style={{
                            marginTop: '0.6rem', padding: '0.5rem',
                            borderRadius: '8px',
                            background: `linear-gradient(135deg, ${sectorColor}06, ${sectorColor}03)`,
                            border: `1px solid ${sectorColor}12`,
                            textAlign: 'center',
                        }}>
                            <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', marginBottom: '2px', letterSpacing: '0.04em' }}>
                                PRIZE DISTRIBUTION
                            </div>
                            <div style={{ fontSize: '0.65rem', fontWeight: 600, color: sectorColor }}>
                                🥇 50% · 🥈 30% · 🥉 20%
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
