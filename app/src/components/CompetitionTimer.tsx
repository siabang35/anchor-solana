'use client';

import React, { useState, useEffect, useMemo } from 'react';

interface Props {
    startTime: number; // unix timestamp (seconds)
    endTime: number;   // unix timestamp (seconds)
    label?: string;
}

type Phase = 'upcoming' | 'live' | 'ended';

function padZero(n: number): string {
    return String(Math.max(0, Math.floor(n))).padStart(2, '0');
}

export default function CompetitionTimer({ startTime, endTime, label }: Props) {
    const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

    useEffect(() => {
        const id = setInterval(() => {
            setNow(Math.floor(Date.now() / 1000));
        }, 1000);
        return () => clearInterval(id);
    }, []);

    const phase: Phase = useMemo(() => {
        if (now < startTime) return 'upcoming';
        if (now >= startTime && now < endTime) return 'live';
        return 'ended';
    }, [now, startTime, endTime]);

    const remaining = useMemo(() => {
        const target = phase === 'upcoming' ? startTime : endTime;
        const diff = Math.max(0, target - now);
        const days = Math.floor(diff / 86400);
        const hours = Math.floor((diff % 86400) / 3600);
        const minutes = Math.floor((diff % 3600) / 60);
        const seconds = diff % 60;
        return { days, hours, minutes, seconds, total: diff };
    }, [now, phase, startTime, endTime]);

    const phaseLabel = phase === 'upcoming' ? 'Starts in' : phase === 'live' ? 'Ends in' : 'Ended';
    const phaseClass = `competition-timer--${phase}`;

    return (
        <div className={`competition-timer ${phaseClass}`}>
            {label && <span className="competition-timer__label">{label}</span>}
            <div className="competition-timer__phase">
                {phase === 'live' && <span className="competition-timer__pulse" />}
                <span className="competition-timer__phase-text">{phaseLabel}</span>
            </div>
            {phase !== 'ended' ? (
                <div className="competition-timer__countdown">
                    {remaining.days > 0 && (
                        <div className="competition-timer__unit">
                            <span className="competition-timer__value">{padZero(remaining.days)}</span>
                            <span className="competition-timer__suffix">d</span>
                        </div>
                    )}
                    <div className="competition-timer__unit">
                        <span className="competition-timer__value">{padZero(remaining.hours)}</span>
                        <span className="competition-timer__suffix">h</span>
                    </div>
                    <div className="competition-timer__unit">
                        <span className="competition-timer__value">{padZero(remaining.minutes)}</span>
                        <span className="competition-timer__suffix">m</span>
                    </div>
                    <div className="competition-timer__unit">
                        <span className="competition-timer__value competition-timer__value--seconds">{padZero(remaining.seconds)}</span>
                        <span className="competition-timer__suffix">s</span>
                    </div>
                </div>
            ) : (
                <span className="competition-timer__ended">Competition Complete</span>
            )}
        </div>
    );
}
