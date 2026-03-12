import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';

export interface BetSelection {
    id: string; // Composite key: marketId-outcome
    marketId: string;
    question: string;
    outcome: 'yes' | 'no';
    price: number;
    homeTeam?: string;
    awayTeam?: string;
    sport?: string;
}

interface BetSlipContextType {
    selections: BetSelection[];
    amounts: Record<string, number>;
    isOpen: boolean;
    addToBetSlip: (selection: BetSelection) => void;
    removeFromBetSlip: (id: string) => void;
    clearBetSlip: () => void;
    updateAmount: (id: string, amount: number) => void;
    toggleBetSlip: () => void;
    openBetSlip: () => void;
    closeBetSlip: () => void;
    calculations: {
        totalStake: number;
        potentialPayout: number;
        potentialProfit: number;
    };
}

const BetSlipContext = createContext<BetSlipContextType | undefined>(undefined);

export function BetSlipProvider({ children }: { children: ReactNode }) {
    const [selections, setSelections] = useState<BetSelection[]>([]);
    const [amounts, setAmounts] = useState<Record<string, number>>({});
    const [isOpen, setIsOpen] = useState(false);

    // Load from local storage on mount
    useEffect(() => {
        const saved = localStorage.getItem('betslip_selections');
        if (saved) {
            try {
                setSelections(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to parse saved betslip", e);
            }
        }
    }, []);

    // Save to local storage on change
    useEffect(() => {
        localStorage.setItem('betslip_selections', JSON.stringify(selections));
    }, [selections]);

    const addToBetSlip = (selection: BetSelection) => {
        setSelections(prev => {
            // Check if already exists
            if (prev.some(s => s.id === selection.id)) return prev;
            return [...prev, selection];
        });
        setIsOpen(true);
    };

    const removeFromBetSlip = (id: string) => {
        setSelections(prev => prev.filter(s => s.id !== id));
        setAmounts(prev => {
            const newAmounts = { ...prev };
            delete newAmounts[id];
            return newAmounts;
        });
    };

    const clearBetSlip = () => {
        setSelections([]);
        setAmounts({});
    };

    const updateAmount = (id: string, amount: number) => {
        setAmounts(prev => ({ ...prev, [id]: amount }));
    };

    const toggleBetSlip = () => setIsOpen(prev => !prev);
    const openBetSlip = () => setIsOpen(true);
    const closeBetSlip = () => setIsOpen(false);

    const calculations = useMemo(() => {
        let totalStake = 0;
        let potentialPayout = 0;

        selections.forEach(sel => {
            const amount = amounts[sel.id] || 0;
            totalStake += amount;
            if (sel.price > 0) {
                potentialPayout += amount / sel.price;
            }
        });

        return {
            totalStake,
            potentialPayout,
            potentialProfit: potentialPayout - totalStake
        };
    }, [selections, amounts]);

    return (
        <BetSlipContext.Provider value={{
            selections,
            amounts,
            isOpen,
            addToBetSlip,
            removeFromBetSlip,
            clearBetSlip,
            updateAmount,
            toggleBetSlip,
            openBetSlip,
            closeBetSlip,
            calculations
        }}>
            {children}
        </BetSlipContext.Provider>
    );
}

export function useBetSlip() {
    const context = useContext(BetSlipContext);
    if (context === undefined) {
        throw new Error('useBetSlip must be used within a BetSlipProvider');
    }
    return context;
}
