'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, Search, SlidersHorizontal, Wallet } from 'lucide-react';

interface Props {
    onOpenMenu?: () => void;
}

export default function MobileBottomNav({ onOpenMenu }: Props) {
    const pathname = usePathname();

    const navItems = [
        { href: '/', label: 'Home', icon: House, isButton: false },
        { href: '/signals', label: 'Search', icon: Search, isButton: false },
        { href: '/for-you', label: 'For You', icon: SlidersHorizontal, isButton: false },
        { href: '/portfolio', label: 'Portfolio', icon: Wallet, isButton: false },
    ];

    return (
        <>
            <nav className="mobile-bottom-nav">
                <div className="mobile-bottom-nav__inner">
                    {navItems.map((item) => {
                        const isActive = item.href === pathname;
                        const Icon = item.icon;

                        if (item.isButton) {
                            return (
                                <button
                                    key={item.label}
                                    onClick={onOpenMenu}
                                    className="mobile-bottom-nav__item"
                                >
                                    <div className="icon"><Icon strokeWidth={2} size={24} /></div>
                                    <span className="label">{item.label}</span>
                                </button>
                            );
                        }

                        return (
                            <Link
                                key={item.label}
                                href={item.href}
                                className={`mobile-bottom-nav__item ${isActive ? 'active' : ''}`}
                            >
                                <div className="icon"><Icon strokeWidth={isActive ? 2.5 : 2} size={24} /></div>
                                <span className="label">{item.label}</span>
                            </Link>
                        );
                    })}
                </div>
            </nav>

            <style>{`
                .mobile-bottom-nav {
                    display: none;
                    position: fixed;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    background: rgba(15, 23, 42, 0.97);
                    backdrop-filter: blur(24px);
                    -webkit-backdrop-filter: blur(24px);
                    border-top: 1px solid rgba(255, 255, 255, 0.08);
                    z-index: 100;
                    padding-bottom: env(safe-area-inset-bottom);
                    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.4);
                }

                .mobile-bottom-nav__inner {
                    display: flex;
                    align-items: center;
                    justify-content: space-around;
                    height: 60px;
                    padding: 0 0.25rem;
                }

                .mobile-bottom-nav__item {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 3px;
                    flex: 1;
                    height: 100%;
                    text-decoration: none;
                    color: rgba(148, 163, 184, 0.6);
                    background: transparent;
                    border: none;
                    cursor: pointer;
                    transition: color 0.25s ease;
                    -webkit-tap-highlight-color: transparent;
                }

                .mobile-bottom-nav__item.active {
                    color: var(--accent-cyan, #22d3ee);
                }

                .mobile-bottom-nav__item .icon {
                    line-height: 1;
                    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                }

                .mobile-bottom-nav__item.active .icon {
                    transform: scale(1.1);
                }

                .mobile-bottom-nav__item .label {
                    font-size: 0.6rem;
                    font-weight: 600;
                    letter-spacing: 0.03em;
                }

                .mobile-bottom-nav__item.active .label {
                    font-weight: 700;
                }

                .mobile-bottom-nav__item:active .icon {
                    transform: scale(0.9);
                }

                @media (max-width: 768px) {
                    .mobile-bottom-nav {
                        display: block;
                    }
                    body {
                        padding-bottom: calc(60px + env(safe-area-inset-bottom));
                    }
                }
            `}</style>
        </>
    );
}
