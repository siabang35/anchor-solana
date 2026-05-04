'use client';

import React from 'react';
import { useGlobalPool } from '@/hooks/usePool';

const RANK_CONFIG = [
    { emoji: '🥇', label: '1st', gradient: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)', glow: 'rgba(251,191,36,0.35)', color: '#fbbf24', size: '32px' },
    { emoji: '🥈', label: '2nd', gradient: 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)', glow: 'rgba(148,163,184,0.25)', color: '#94a3b8', size: '28px' },
    { emoji: '🥉', label: '3rd', gradient: 'linear-gradient(135deg, #cd7f32 0%, #a0522d 100%)', glow: 'rgba(205,127,50,0.25)', color: '#cd7f32', size: '28px' },
    { emoji: '⭐', label: '4th', gradient: 'linear-gradient(135deg, #818cf8 0%, #6366f1 100%)', glow: 'rgba(129,140,248,0.2)', color: '#818cf8', size: '26px' },
];

interface Props {
    limit?: number;
}

export default function GlobalPoolWinners({ limit = 4 }: Props) {
    const { pool, winners, loading } = useGlobalPool(limit);

    return (
        <div className="glass-card animate-in" style={{ overflow: 'hidden' }}>
            {/* Header */}
            <div style={{
                padding: '1rem 1.25rem 0.75rem',
                borderBottom: '1px solid var(--border-glass)',
                background: 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(168,85,247,0.04) 50%, rgba(236,72,153,0.03) 100%)',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{
                        fontSize: '0.9rem', fontWeight: 800, margin: 0,
                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                        color: 'var(--text-primary)',
                    }}>
                        <span>🌐</span> Global Pool & Champions
                    </h3>
                    <span style={{
                        fontSize: '0.5rem', fontWeight: 700, padding: '2px 8px',
                        borderRadius: '9999px',
                        background: 'rgba(16,185,129,0.15)', color: '#10b981',
                        animation: 'pulse 2s infinite',
                    }}>
                        ● LIVE
                    </span>
                </div>
            </div>

            <div style={{ padding: '1rem 1.25rem' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        <div style={{ animation: 'pulse 1.5s infinite', fontSize: '1.5rem', marginBottom: '0.4rem' }}>🌐</div>
                        Loading global data...
                    </div>
                ) : (
                    <>
                        {/* Global Pool Amount */}
                        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                            <div style={{
                                fontSize: '2.2rem', fontWeight: 900,
                                fontFamily: 'var(--font-mono)',
                                background: 'linear-gradient(135deg, #818cf8, #a78bfa, #ec4899)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                letterSpacing: '-0.02em',
                                lineHeight: 1.1,
                            }}>
                                {Number(pool.total_pool || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} SOL
                            </div>
                            <div style={{
                                fontSize: '0.6rem', color: 'var(--text-muted)',
                                marginTop: '0.25rem', letterSpacing: '0.06em',
                                textTransform: 'uppercase',
                            }}>
                                GLOBAL PRIZE POOL
                            </div>
                        </div>

                        {/* Global Stats Bar */}
                        <div style={{
                            display: 'flex', gap: '0.4rem', marginBottom: '1rem',
                            flexWrap: 'wrap',
                        }}>
                            {[
                                { label: 'Total Staked', value: `${Number(pool.total_staked || 0).toFixed(2)} SOL`, color: '#818cf8' },
                                { label: 'Competitions', value: pool.competition_count || 0, color: '#10b981' },
                                { label: 'Participants', value: pool.total_participants || 0, color: '#f59e0b' },
                            ].map((stat) => (
                                <div key={stat.label} style={{
                                    flex: 1, minWidth: '70px', padding: '0.45rem 0.5rem',
                                    borderRadius: '10px', background: 'var(--bg-input)',
                                    border: '1px solid var(--border-card)', textAlign: 'center',
                                }}>
                                    <div style={{ fontSize: '0.45rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '2px' }}>
                                        {stat.label}
                                    </div>
                                    <div style={{
                                        fontSize: '0.75rem', fontWeight: 800,
                                        fontFamily: 'var(--font-mono)', color: stat.color,
                                    }}>
                                        {stat.value}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Sector Breakdown (if available) */}
                        {pool.sectors && pool.sectors.length > 0 && (
                            <div style={{
                                marginBottom: '0.75rem',
                                padding: '0.5rem',
                                borderRadius: '10px',
                                background: 'var(--bg-input)',
                                border: '1px solid var(--border-card)',
                            }}>
                                <div style={{ fontSize: '0.5rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.4rem', letterSpacing: '0.04em' }}>
                                    SECTOR BREAKDOWN
                                </div>
                                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                    {pool.sectors.slice(0, 7).map((s) => (
                                        <span key={s.sector} style={{
                                            fontSize: '0.5rem', fontWeight: 700,
                                            padding: '2px 6px', borderRadius: '6px',
                                            background: 'var(--bg-card)', border: '1px solid var(--border-glass)',
                                            color: 'var(--text-secondary)',
                                        }}>
                                            {s.sector}: {Number(s.pool || 0).toFixed(1)} SOL
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Global Champions */}
                        <div style={{
                            borderTop: '1px solid var(--border-glass)',
                            paddingTop: '0.75rem',
                        }}>
                            <div style={{
                                fontSize: '0.55rem', fontWeight: 700, color: 'var(--text-muted)',
                                textTransform: 'uppercase', letterSpacing: '0.06em',
                                marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem',
                            }}>
                                👑 Global Champions
                            </div>

                            {winners.length === 0 ? (
                                <div style={{
                                    textAlign: 'center', padding: '1.2rem',
                                    borderRadius: '12px', border: '1px dashed var(--border-glass)',
                                    background: 'var(--bg-input)',
                                }}>
                                    <div style={{ fontSize: '1.2rem', marginBottom: '0.3rem' }}>🌐</div>
                                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                        No global champions yet
                                    </div>
                                    <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                        Deploy agents and compete across markets to become a champion!
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    {winners.slice(0, limit).map((winner, i) => {
                                        const cfg = RANK_CONFIG[i] || RANK_CONFIG[3];
                                        const accuracy = winner.global_accuracy || winner.final_accuracy || 0;
                                        return (
                                            <div key={winner.agent_id} style={{
                                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                padding: '0.55rem 0.65rem', borderRadius: '12px',
                                                background: i === 0 ? `${cfg.color}0A` : 'transparent',
                                                border: `1px solid ${i === 0 ? `${cfg.color}25` : 'var(--border-card)'}`,
                                                transition: 'all 0.3s ease',
                                                boxShadow: i === 0 ? `0 2px 12px ${cfg.glow}` : 'none',
                                            }}>
                                                {/* Rank Badge */}
                                                <div style={{
                                                    width: cfg.size, height: cfg.size, borderRadius: '10px',
                                                    background: cfg.gradient,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: i === 0 ? '0.85rem' : '0.7rem', flexShrink: 0,
                                                    boxShadow: `0 2px 8px ${cfg.glow}`,
                                                }}>
                                                    {cfg.emoji}
                                                </div>

                                                {/* Agent Info */}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{
                                                        fontSize: i === 0 ? '0.7rem' : '0.65rem', fontWeight: 700,
                                                        color: 'var(--text-primary)',
                                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                        display: 'flex', alignItems: 'center', gap: '0.3rem',
                                                    }}>
                                                        {winner.agent_name}
                                                        {winner.total_wins && winner.total_wins > 0 && (
                                                            <span style={{
                                                                fontSize: '0.4rem', fontWeight: 800,
                                                                padding: '1px 4px', borderRadius: '4px',
                                                                background: 'rgba(251,191,36,0.12)', color: '#fbbf24',
                                                            }}>
                                                                {winner.total_wins}W
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{
                                                        fontSize: '0.5rem', color: 'var(--text-muted)',
                                                        display: 'flex', gap: '0.3rem', alignItems: 'center',
                                                        marginTop: '1px',
                                                    }}>
                                                        <span style={{ color: '#10b981', fontWeight: 700 }}>
                                                            {accuracy.toFixed(1)}% ACC
                                                        </span>
                                                        <span>·</span>
                                                        <span>{winner.total_predictions || winner.prediction_count || 0} preds</span>
                                                        {winner.competitions_entered && (
                                                            <>
                                                                <span>·</span>
                                                                <span>{winner.competitions_entered} comps</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Prize/Score */}
                                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                    {(winner.total_prize_earned || 0) > 0 ? (
                                                        <>
                                                            <div style={{
                                                                fontSize: '0.7rem', fontWeight: 800,
                                                                fontFamily: 'var(--font-mono)', color: cfg.color,
                                                            }}>
                                                                {Number(winner.total_prize_earned || 0).toFixed(2)}
                                                            </div>
                                                            <div style={{ fontSize: '0.45rem', color: 'var(--text-muted)' }}>SOL won</div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div style={{
                                                                fontSize: '0.65rem', fontWeight: 800,
                                                                fontFamily: 'var(--font-mono)', color: cfg.color,
                                                            }}>
                                                                #{winner.rank}
                                                            </div>
                                                            <div style={{ fontSize: '0.45rem', color: 'var(--text-muted)' }}>global</div>
                                                        </>
                                                    )}
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
                            background: 'linear-gradient(135deg, rgba(99,102,241,0.04) 0%, rgba(168,85,247,0.04) 100%)',
                            border: '1px solid rgba(99,102,241,0.1)',
                            textAlign: 'center',
                        }}>
                            <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', marginBottom: '2px', letterSpacing: '0.04em' }}>
                                REWARD FORMULA
                            </div>
                            <div style={{ fontSize: '0.65rem', fontWeight: 600, color: '#818cf8' }}>
                                Accuracy × Exposure × Curve Difficulty × Pool Multiplier
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
