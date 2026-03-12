import { MessageCircle, Share2, TrendingUp, BarChart2 } from "lucide-react";
import { memo } from "react";
import { motion } from "framer-motion";

interface MarketCardProps {
  id?: string;
  title: string;
  image?: string;
  emoji?: string;
  questions: {
    text: string;
    yesPercent: number;
    noPercent: number;
  }[];
  volume?: string;
  comments?: number;
  badge?: string;
  onSelectOutcome?: (outcome: 'yes' | 'no', choiceItem: any) => void;
}

export const MarketCard = memo(function MarketCard({
  id,
  title,
  image,
  emoji,
  questions,
  volume,
  comments = 0,
  badge,
  onSelectOutcome
}: MarketCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="group relative flex flex-col h-full bg-card/50 backdrop-blur-sm border border-border/60 rounded-xl overflow-hidden hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300"
    >
      {/* Header Area */}
      <div className="p-4 flex gap-4">
        {image ? (
          <div className="w-12 h-12 rounded-lg bg-accent/10 overflow-hidden shadow-inner flex-shrink-0 group-hover:ring-2 group-hover:ring-primary/20 transition-all duration-300">
            <img
              src={image}
              alt={title || "Market Image"}
              className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                // Find parent container and inject fallback icon visually if needed, 
                // or just hide the image container to let the layout collapse naturally
                const parent = e.currentTarget.parentElement;
                if (parent) {
                  parent.style.display = 'none';
                  // Optional: We could dynamically insert the emoji/icon fallback here
                  // but hiding is safer to avoid UI jank
                }
              }}
            />
          </div>
        ) : emoji ? (
          <div className="w-12 h-12 rounded-lg bg-accent/50 flex items-center justify-center text-2xl shadow-inner group-hover:scale-105 transition-transform duration-300">
            {emoji}
          </div>
        ) : (
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center shadow-inner">
            <BarChart2 className="w-6 h-6 text-primary/60" />
          </div>
        )}

        <div className="flex-1 min-w-0 py-0.5">
          <div className="flex items-center gap-2 mb-1">
            {badge && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-500 border border-blue-500/20">
                {badge}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">AI Agent Competition</span>
          </div>
          <h3 className="text-base font-semibold leading-tight text-foreground group-hover:text-primary transition-colors line-clamp-2">
            {title}
          </h3>
        </div>
      </div>

      {/* Action Area (Order Book Buttons) */}
      <div className="px-4 pb-4 flex-1 flex flex-col justify-end space-y-3">
        {questions.map((question, idx) => (
          <div key={idx} className="space-y-1.5">
            {questions.length > 1 && (
              <p className="text-xs font-medium text-muted-foreground pl-1">{question.text}</p>
            )}

            <div className="grid grid-cols-2 gap-3">
              {/* YES Order Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectOutcome?.('yes', { marketId: id, title, question: question.text, price: question.yesPercent / 100 });
                }}
                className="relative flex flex-col items-center justify-center py-2 rounded-lg bg-green-500/5 hover:bg-green-500/15 border border-green-500/30 transition-all active:scale-[0.98] group/btn"
              >
                <span className="text-xs font-bold text-green-600 dark:text-green-400 mb-0.5">YES</span>
                <span className="text-lg font-bold text-green-700 dark:text-green-300 tracking-tight">{question.yesPercent}%</span>
                <span className="text-[10px] text-green-600/60 dark:text-green-400/60">Limit Buy</span>

                {/* Progress Bar Background */}
                <div
                  className="absolute bottom-0 left-0 h-1 bg-green-500/50 transition-all duration-500"
                  style={{ width: `${question.yesPercent}%`, opacity: 0.3 }}
                />
              </button>

              {/* NO Order Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectOutcome?.('no', { marketId: id, title, question: question.text, price: question.noPercent / 100 });
                }}
                className="relative flex flex-col items-center justify-center py-2 rounded-lg bg-red-500/5 hover:bg-red-500/15 border border-red-500/30 transition-all active:scale-[0.98] group/btn"
              >
                <span className="text-xs font-bold text-red-600 dark:text-red-400 mb-0.5">NO</span>
                <span className="text-lg font-bold text-red-700 dark:text-red-300 tracking-tight">{question.noPercent}%</span>
                <span className="text-[10px] text-red-600/60 dark:text-red-400/60">Limit Sell</span>

                <div
                  className="absolute bottom-0 left-0 h-1 bg-red-500/50 transition-all duration-500"
                  style={{ width: `${question.noPercent}%`, opacity: 0.3 }}
                />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Footer Metadata */}
      <div className="px-4 py-3 bg-secondary/30 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          {volume && (
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              <span className="font-medium text-foreground/80">{volume} Vol</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 hover:text-foreground cursor-pointer transition-colors">
            <MessageCircle className="w-3.5 h-3.5" />
            <span>{comments}</span>
          </div>
        </div>
        <button className="p-1.5 hover:bg-background rounded-full transition-colors text-muted-foreground hover:text-primary">
          <Share2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
});