import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';

interface Props {
    startTime: number; // unix timestamp (seconds)
    endTime: number;   // unix timestamp (seconds)
    label?: string;
}

type Phase = 'upcoming' | 'live' | 'ended';

function padZero(n: number): string {
    return String(Math.max(0, Math.floor(n))).padStart(2, '0');
}

export function CompetitionTimer({ startTime, endTime, label }: Props) {
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

    const phaseStyles = {
        upcoming: 'border-amber-500/30 bg-amber-500/5',
        live: 'border-emerald-500/30 bg-emerald-500/5',
        ended: 'border-border/50 bg-muted/20',
    };

    const phaseTextColor = {
        upcoming: 'text-amber-400',
        live: 'text-emerald-400',
        ended: 'text-muted-foreground',
    };

    const units = [
        ...(remaining.days > 0 ? [{ value: remaining.days, suffix: 'd' }] : []),
        { value: remaining.hours, suffix: 'h' },
        { value: remaining.minutes, suffix: 'm' },
        { value: remaining.seconds, suffix: 's' },
    ];

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-2xl border backdrop-blur-md p-4 md:p-5 flex flex-col items-center gap-3 ${phaseStyles[phase]}`}
        >
            {label && (
                <span className="text-xs font-semibold text-muted-foreground line-clamp-1 max-w-full text-center">
                    {label}
                </span>
            )}

            <div className={`flex items-center gap-2 ${phaseTextColor[phase]}`}>
                {phase === 'live' && (
                    <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                    </span>
                )}
                <span className="text-xs font-bold uppercase tracking-widest">{phaseLabel}</span>
            </div>

            {phase !== 'ended' ? (
                <div className="flex items-center gap-1.5 md:gap-2">
                    {units.map((u, i) => (
                        <div key={i} className="flex items-baseline">
                            <span className={`text-2xl md:text-3xl font-extrabold font-mono tabular-nums ${
                                u.suffix === 's' ? 'text-foreground/60 animate-pulse' : 'text-foreground'
                            }`}>
                                {padZero(u.value)}
                            </span>
                            <span className="text-xs font-bold text-muted-foreground ml-0.5">{u.suffix}</span>
                            {i < units.length - 1 && (
                                <span className="text-muted-foreground/40 text-lg mx-0.5 font-light">:</span>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <span className="text-lg font-bold text-muted-foreground">Competition Complete</span>
            )}
        </motion.div>
    );
}
