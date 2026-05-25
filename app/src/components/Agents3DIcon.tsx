import React from 'react';

export const Assets3DIcon = ({ size = 18 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ filter: `drop-shadow(0px 2px 4px rgba(34, 211, 238, 0.35))` }}>
        <path d="M4 14l4 2v6l-4-2z" fill="url(#leftFace1)" />
        <path d="M8 16l4-2v6l-4 2z" fill="url(#rightFace1)" />
        <path d="M8 10l4-2-4-2-4 2z" fill="url(#topFace1)" />

        <path d="M12 10l4 2v10l-4-2z" fill="url(#leftFace2)" />
        <path d="M16 12l4-2v10l-4 2z" fill="url(#rightFace2)" />
        <path d="M16 4l4-2-4-2-4 2z" fill="url(#topFace2)" />

        <defs>
            <linearGradient id="leftFace1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0891b2" />
                <stop offset="100%" stopColor="#0e7490" />
            </linearGradient>
            <linearGradient id="rightFace1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
            <linearGradient id="topFace1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#67e8f9" />
                <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>

            <linearGradient id="leftFace2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4f46e5" />
                <stop offset="100%" stopColor="#3730a3" />
            </linearGradient>
            <linearGradient id="rightFace2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#4f46e5" />
            </linearGradient>
            <linearGradient id="topFace2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#a5b4fc" />
                <stop offset="100%" stopColor="#818cf8" />
            </linearGradient>
        </defs>
    </svg>
);

export const Agents3DIcon = ({ size = 18 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ filter: `drop-shadow(0px 2px 4px rgba(168, 85, 247, 0.35))` }}>
        <path d="M12 2L20 6v12l-8 4-8-4V6z" fill="url(#agentLeft)" opacity="0.15" />
        <circle cx="12" cy="12" r="6" fill="url(#orbGrad)" />
        <circle cx="12" cy="12" r="6" stroke="url(#strokeGrad)" strokeWidth="1" strokeDasharray="2,2" />
        <ellipse cx="12" cy="12" rx="9" ry="3" stroke="#a855f7" strokeWidth="1" opacity="0.6" transform="rotate(-15 12 12)" />
        <ellipse cx="12" cy="12" rx="4" ry="1.5" stroke="#ec4899" strokeWidth="1" opacity="0.8" transform="rotate(15 12 12)" />

        <defs>
            <linearGradient id="agentLeft" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#a855f7" />
                <stop offset="100%" stopColor="#6366f1" />
            </linearGradient>
            <radialGradient id="orbGrad" cx="50%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#e9d5ff" />
                <stop offset="50%" stopColor="#c084fc" />
                <stop offset="100%" stopColor="#7e22ce" />
            </radialGradient>
            <linearGradient id="strokeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f472b6" />
                <stop offset="100%" stopColor="#818cf8" />
            </linearGradient>
        </defs>
    </svg>
);
