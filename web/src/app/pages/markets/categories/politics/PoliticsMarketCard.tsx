import { memo } from "react";
import { motion } from "motion/react";
import { PlusCircle } from "lucide-react";

interface PoliticsMarketCardProps {
    id: string;
    title: string;
    image?: string; // URL to image
    questions: {
        text: string;
        yesPercent: number;
        noPercent: number;
    }[];
    volume?: string;
    endDate?: string; // e.g. "Before Feb 1"
    onSelectOutcome?: (outcome: 'yes' | 'no', choiceItem: any) => void;
}

export const PoliticsMarketCard = memo(function PoliticsMarketCard({
    id,
    title,
    image,
    questions,
    volume,
    endDate,
    onSelectOutcome
}: PoliticsMarketCardProps) {
    // Politics markets usually focus on the "Main" question or the first one if multiple are bundled.
    // Kalshi cards often show one main question per card in the grid.
    const mainQuestion = questions[0];

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="group relative flex flex-col bg-card/40 hover:bg-card/60 border border-border/40 hover:border-border/80 rounded-xl overflow-hidden transition-all duration-200"
        >
            {/* Main Content */}
            <div className="p-4 flex flex-col h-full gap-4">

                {/* Header: Icon/Image + Title + Timeframe */}
                <div className="flex items-start gap-3">
                    {/* Icon / Image Placeholder */}
                    <div className="shrink-0 w-10 h-10 rounded-md bg-secondary/50 overflow-hidden flex items-center justify-center border border-border/30">
                        {image ? (
                            <img src={image} alt="" className="w-full h-full object-cover" />
                        ) : (
                            /* Fallback Icon for Politics */
                            <span className="text-xl">🏛️</span>
                        )}
                    </div>

                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium leading-normal text-foreground/90 line-clamp-2 group-hover:text-primary transition-colors">
                            {title}
                        </h3>
                        {endDate && (
                            <p className="text-[10px] text-muted-foreground mt-1 font-medium uppercase tracking-wide">
                                {endDate}
                            </p>
                        )}
                    </div>
                </div>

                {/* Spacer to push buttons down if needed */}
                <div className="flex-1" />

                {/* Betting Buttons (Kalshi Style: Dark buttons with Yes/No text) */}
                {/* Designed for the NEW 'Kalshi' look: 
                    - Row with Name/Price/Yes/No? Or just Yes/No buttons?
                    - Kalshi grid cards show "Yes $0.xx" and "No $0.xx" or just the price split.
                    - Based on screenshot: Two columns "Yes" "No"
                */}
                {mainQuestion && (
                    <div className="grid grid-cols-2 gap-2 mt-auto">

                        {/* YES Button */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelectOutcome?.('yes', { marketId: id, title, question: mainQuestion.text, price: mainQuestion.yesPercent / 100 });
                            }}
                            className="relative group/btn overflow-hidden rounded-md bg-[#0F1A2A] hover:bg-[#142236] border border-blue-900/30 hover:border-blue-500/50 transition-all py-2 px-3 flex items-center justify-between"
                        >
                            <div className="flex flex-col items-start z-10">
                                <span className="text-[10px] uppercase font-bold text-blue-400">Yes</span>
                                <span className="text-sm font-bold text-white">{mainQuestion.yesPercent}%</span>
                            </div>

                            {/* Subtle Buy Text on Hover? Or just keep clean */}
                        </button>

                        {/* NO Button */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelectOutcome?.('no', { marketId: id, title, question: mainQuestion.text, price: mainQuestion.noPercent / 100 });
                            }}
                            className="relative group/btn overflow-hidden rounded-md bg-[#1A1010] hover:bg-[#2A1515] border border-red-900/30 hover:border-red-500/50 transition-all py-2 px-3 flex items-center justify-between"
                        >
                            <div className="flex flex-col items-start z-10">
                                <span className="text-[10px] uppercase font-bold text-red-400">No</span>
                                <span className="text-sm font-bold text-white">{mainQuestion.noPercent}%</span>
                            </div>
                        </button>
                    </div>
                )}
            </div>

            {/* Footer / Meta Data Row (Optional, Volume + Add Button like screenshot) */}
            <div className="px-4 pb-3 flex items-center justify-between">
                <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-2">
                    {volume && <span>${volume} Vol</span>}
                </div>

                {/* Quick Add / Watchlist toggle */}
                <button className="text-muted-foreground/60 hover:text-primary transition-colors">
                    <PlusCircle className="w-4 h-4" />
                </button>
            </div>

        </motion.div>
    );
});
