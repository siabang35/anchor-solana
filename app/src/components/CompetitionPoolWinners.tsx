'use client';

import React from 'react';
import { useCompetitionPool, PoolStake } from '@/hooks/usePool';

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
    { emoji: '🥇', label: '1st Place', gradient: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)', glow: 'rgba(251,191,36,0.3)', color: '#fbbf24', share: '50%' },
    { emoji: '🥈', label: '2nd Place', gradient: 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)', glow: 'rgba(148,163,184,0.25)', color: '#94a3b8', share: '30%' },
    { emoji: '🥉', label: '3rd Place', gradient: 'linear-gradient(135deg, #cd7f32 0%, #a0522d 100%)', glow: 'rgba(205,127,50,0.25)', color: '#cd7f32', share: '20%' },
];

/** Open Solscan in new tab for a devnet TX */
function openSolscan(tx: string) {
    window.open(`https://solscan.io/tx/${tx}?cluster=devnet`, '_blank');
}

/** Shorten a TX hash for display */
function shortTx(tx: string): string {
    if (!tx || tx.length < 12) return tx || '—';
    return `${tx.slice(0, 6)}…${tx.slice(-4)}`;
}

interface Props {
    competitionId?: string | null;
    sector: string;
}

export default function CompetitionPoolWinners({ competitionId, sector }: Props) {
    const { pool, winners, stakes, loading } = useCompetitionPool(competitionId);
    const sectorColor = SECTOR_COLORS[sector] || '#818cf8';

    if (!competitionId) return null;

    // Calculate fee breakdown for display
    const totalStaked = Number(pool.total_staked || pool.total_pool || 0);
    const platformFee = Number(pool.platform_fee || 0);
    const distributable = Number(pool.distributable_pool || 0);
    const stakeCount = Number(pool.stake_count || pool.total_participants || 0);

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
                        <span>🎯</span> Target Market Pool
                    </h3>
                    <span style={{
                        fontSize: '0.5rem', fontWeight: 700, padding: '2px 8px',
                        borderRadius: '9999px',
                        background: pool.settlement_status === 'settled' ? '#10b98115' : `${sectorColor}15`,
                        color: pool.settlement_status === 'settled' ? '#10b981' : sectorColor,
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                        border: `1px solid ${pool.settlement_status === 'settled' ? '#10b98130' : `${sectorColor}30`}`,
                    }}>
                        {pool.settlement_status === 'settled' ? '✅ Settled' : '🔴 Live'}
                    </span>
                </div>
            </div>

            <div style={{ padding: '0.6rem 1rem' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        <div style={{ animation: 'pulse 1.5s infinite', fontSize: '1.2rem', marginBottom: '0.2rem' }}>💎</div>
                        Loading pool data...
                    </div>
                ) : (
                    <>
                        {/* Pool Amount - Hero Display with Fee Breakdown */}
                        <div style={{ textAlign: 'center', marginBottom: '0.6rem' }}>
                            <div style={{
                                fontSize: '1.6rem', fontWeight: 900,
                                fontFamily: 'var(--font-mono)',
                                background: `linear-gradient(135deg, ${sectorColor}, ${sectorColor}99)`,
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                letterSpacing: '-0.02em',
                                lineHeight: 1.1,
                            }}>
                                {distributable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} SOL
                            </div>
                            <div style={{
                                fontSize: '0.55rem', color: 'var(--text-muted)',
                                marginTop: '0.15rem', letterSpacing: '0.04em',
                            }}>
                                DISTRIBUTABLE PRIZE POOL
                            </div>
                        </div>

                        {/* Stats Grid with Fee Breakdown */}
                        <div style={{
                            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                            gap: '0.4rem', marginBottom: '0.6rem',
                        }}>
                            <div style={{ padding: '0.4rem', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-card)' }}>
                                <div style={{ fontSize: '0.45rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '2px', textTransform: 'uppercase' }}>Total Staked</div>
                                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: sectorColor, fontFamily: 'var(--font-mono)' }}>
                                    {totalStaked.toFixed(4)}
                                </div>
                                <div style={{ fontSize: '0.4rem', color: 'var(--text-muted)' }}>SOL</div>
                            </div>
                            <div style={{ padding: '0.4rem', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-card)' }}>
                                <div style={{ fontSize: '0.45rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '2px', textTransform: 'uppercase' }}>Fee (2%)</div>
                                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#ef4444', fontFamily: 'var(--font-mono)' }}>
                                    {platformFee.toFixed(4)}
                                </div>
                                <div style={{ fontSize: '0.4rem', color: 'var(--text-muted)' }}>SOL</div>
                            </div>
                            <div style={{ padding: '0.4rem', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-card)' }}>
                                <div style={{ fontSize: '0.45rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '2px', textTransform: 'uppercase' }}>Stakers</div>
                                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                                    {stakeCount}
                                </div>
                                <div style={{ fontSize: '0.4rem', color: 'var(--text-muted)' }}>users</div>
                            </div>
                        </div>

                        {/* Fee Calculation Display */}
                        {totalStaked > 0 && (
                            <div style={{
                                padding: '0.4rem 0.6rem', borderRadius: '6px',
                                background: `${sectorColor}06`, border: `1px dashed ${sectorColor}25`,
                                marginBottom: '0.6rem', fontSize: '0.55rem',
                                fontFamily: 'var(--font-mono)',
                            }}>
                                <div style={{ color: 'var(--text-muted)', marginBottom: '3px', fontWeight: 600, fontSize: '0.45rem', textTransform: 'uppercase' }}>
                                    💡 Fee Calculation (Realtime)
                                </div>
                                <div style={{ color: 'var(--text-secondary)' }}>
                                    {totalStaked.toFixed(4)} SOL × 2% fee = <span style={{ color: '#ef4444' }}>{platformFee.toFixed(4)} SOL</span>
                                </div>
                                <div style={{ color: sectorColor, fontWeight: 700 }}>
                                    Net Prize: {totalStaked.toFixed(4)} - {platformFee.toFixed(4)} = <span style={{ fontSize: '0.65rem' }}>{distributable.toFixed(4)} SOL</span>
                                </div>
                            </div>
                        )}

                        {/* On-Chain Stakes History */}
                        {stakes.length > 0 && (
                            <div style={{
                                borderTop: '1px solid var(--border-glass)',
                                paddingTop: '0.6rem', marginBottom: '0.8rem',
                            }}>
                                <div style={{
                                    fontSize: '0.5rem', fontWeight: 700, color: 'var(--text-muted)',
                                    textTransform: 'uppercase', letterSpacing: '0.06em',
                                    marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem',
                                }}>
                                    ⛓️ On-Chain Stakes
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: '120px', overflowY: 'auto' }}>
                                    {stakes.map((s: PoolStake, i: number) => (
                                        <div key={i} style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '0.35rem 0.5rem', borderRadius: '8px',
                                            background: 'var(--bg-input)', border: '1px solid var(--border-card)',
                                            fontSize: '0.55rem',
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <span style={{ fontSize: '0.65rem' }}>💰</span>
                                                <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: sectorColor }}>
                                                    {Number(s.stake_amount).toFixed(2)} SOL
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                {s.onchain_tx ? (
                                                    <button
                                                        onClick={() => openSolscan(s.onchain_tx!)}
                                                        style={{
                                                            background: 'none', border: 'none', cursor: 'pointer',
                                                            color: '#818cf8', fontSize: '0.5rem', fontFamily: 'var(--font-mono)',
                                                            textDecoration: 'underline', padding: 0,
                                                        }}
                                                        title={`View on Solscan: ${s.onchain_tx}`}
                                                    >
                                                        {shortTx(s.onchain_tx)} ↗
                                                    </button>
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.45rem' }}>pending</span>
                                                )}
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.4rem' }}>
                                                    {new Date(s.staked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

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
                                                    <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', display: 'flex', gap: '0.3rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                        <span>{winner.prediction_count} preds</span>
                                                        <span>·</span>
                                                        <span style={{ color: '#10b981', fontWeight: 700 }}>{winner.final_accuracy?.toFixed(1) || '0.0'}%</span>
                                                        {/* On-chain TX link */}
                                                        {winner.disburse_tx && (
                                                            <>
                                                                <span>·</span>
                                                                <button
                                                                    onClick={() => openSolscan(winner.disburse_tx!)}
                                                                    style={{
                                                                        background: 'none', border: 'none', cursor: 'pointer',
                                                                        color: '#818cf8', fontSize: '0.45rem', fontFamily: 'var(--font-mono)',
                                                                        textDecoration: 'underline', padding: 0,
                                                                    }}
                                                                    title={`Prize TX: ${winner.disburse_tx}`}
                                                                >
                                                                    TX: {shortTx(winner.disburse_tx)} ↗
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Prize */}
                                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                    <div style={{
                                                        fontSize: '0.7rem', fontWeight: 800,
                                                        fontFamily: 'var(--font-mono)',
                                                        color: cfg.color,
                                                    }}>
                                                        {Number(winner.prize_amount || 0).toFixed(4)}
                                                    </div>
                                                    <div style={{ fontSize: '0.45rem', color: 'var(--text-muted)' }}>SOL ({cfg.share})</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Footer with Prize Distribution */}
                        <div style={{
                            marginTop: '0.6rem', padding: '0.5rem',
                            borderRadius: '8px',
                            background: `linear-gradient(135deg, ${sectorColor}06, ${sectorColor}03)`,
                            border: `1px solid ${sectorColor}12`,
                            textAlign: 'center',
                        }}>
                            <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', marginBottom: '2px', letterSpacing: '0.04em' }}>
                                PRIZE DISTRIBUTION (after 2% fee)
                            </div>
                            <div style={{ fontSize: '0.65rem', fontWeight: 600, color: sectorColor }}>
                                🥇 50% · 🥈 30% · 🥉 20%
                            </div>
                            {distributable > 0 && (
                                <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', marginTop: '3px', fontFamily: 'var(--font-mono)' }}>
                                    🥇 {(distributable * 0.5).toFixed(4)} · 🥈 {(distributable * 0.3).toFixed(4)} · 🥉 {(distributable * 0.2).toFixed(4)} SOL
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
