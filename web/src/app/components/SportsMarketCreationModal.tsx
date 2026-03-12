/**
 * Sports Market Creation Modal
 * 
 * Modal to create an AI agent competition from a sports event.
 * Allows admins to set market type, question, and initial liquidity.
 */

import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from './ui/select';
import { SportsEvent, SportsService } from '../../services/sports.service';
import { Loader2 } from 'lucide-react';

interface SportsMarketCreationModalProps {
    event: SportsEvent | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
}

export function SportsMarketCreationModal({
    event,
    open,
    onOpenChange,
    onSuccess
}: SportsMarketCreationModalProps) {
    const [loading, setLoading] = useState(false);
    const [marketType, setMarketType] = useState('winner'); // winner, spread, total
    const [question, setQuestion] = useState('');
    const [liquidity, setLiquidity] = useState('1000');
    const [spread, setSpread] = useState('');
    const [total, setTotal] = useState('');

    // Pre-fill question based on event and type
    const generateQuestion = (type: string) => {
        if (!event) return '';
        const home = event.homeTeam?.name || event.metadata?.homeTeamName || 'Home';
        const away = event.awayTeam?.name || event.metadata?.awayTeamName || 'Away';

        switch (type) {
            case 'winner':
                return `Will ${home} win against ${away}?`;
            case 'spread':
                return `Will ${home} cover the spread?`;
            case 'total':
                return `Will total points be over the line?`;
            default:
                return '';
        }
    };

    const handleTypeChange = (value: string) => {
        setMarketType(value);
        setQuestion(generateQuestion(value));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!event) return;

        setLoading(true);
        try {
            await SportsService.request<{ id: string }>('/sports/markets', {
                method: 'POST',
                body: JSON.stringify({
                    eventId: event.id,
                    marketType,
                    question,
                    outcomes: ['Yes', 'No'], // Binary for now
                    closesAt: event.startTime, // Close when event starts
                    initialLiquidity: parseFloat(liquidity),
                    metadata: {
                        spread: spread || undefined,
                        total: total || undefined,
                        homeTeam: event.homeTeam?.name,
                        awayTeam: event.awayTeam?.name
                    }
                })
            });

            onSuccess?.();
            onOpenChange(false);
        } catch (error) {
            console.error('Failed to create market:', error);
            // In a real app we'd show a toast error here
        } finally {
            setLoading(false);
        }
    };

    if (!event) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Create Market</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="bg-secondary/20 p-3 rounded-lg text-sm mb-4">
                        <div className="font-semibold">{event.name}</div>
                        <div className="text-muted-foreground">
                            {new Date(event.startTime).toLocaleString()} • {event.league?.name || event.metadata?.leagueName}
                        </div>
                    </div>

                    <div className="grid w-full items-center gap-1.5">
                        <Label htmlFor="type">Market Type</Label>
                        <Select value={marketType} onValueChange={handleTypeChange}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="winner">Match Winner</SelectItem>
                                <SelectItem value="spread">Point Spread</SelectItem>
                                <SelectItem value="total">Total Points (Over/Under)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid w-full items-center gap-1.5">
                        <Label htmlFor="question">Question</Label>
                        <Input
                            id="question"
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            placeholder="e.g. Will Lakers beat Warriors?"
                        />
                    </div>

                    {marketType === 'spread' && (
                        <div className="grid w-full items-center gap-1.5">
                            <Label htmlFor="spread">Spread Value (Points)</Label>
                            <Input
                                id="spread"
                                type="number"
                                step="0.5"
                                value={spread}
                                onChange={(e) => setSpread(e.target.value)}
                                placeholder="e.g. -5.5"
                            />
                        </div>
                    )}

                    {marketType === 'total' && (
                        <div className="grid w-full items-center gap-1.5">
                            <Label htmlFor="total">Total Value (Points)</Label>
                            <Input
                                id="total"
                                type="number"
                                step="0.5"
                                value={total}
                                onChange={(e) => setTotal(e.target.value)}
                                placeholder="e.g. 210.5"
                            />
                        </div>
                    )}

                    <div className="grid w-full items-center gap-1.5">
                        <Label htmlFor="liquidity">Initial Liquidity ($)</Label>
                        <Input
                            id="liquidity"
                            type="number"
                            value={liquidity}
                            onChange={(e) => setLiquidity(e.target.value)}
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Create Market
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
