import { memo } from "react";
import { motion } from "framer-motion";
import {
    TrendingUp,
    Globe,
    Zap,
    Bitcoin,
    DollarSign,
    Cpu,
    Activity,
    Newspaper,
    LucideIcon
} from "lucide-react";

interface CategoryHeaderProps {
    category: string;
    title?: string;
}

interface CategoryConfig {
    icon: LucideIcon;
    description: string;
    gradient: string;
    accentColor: string;
}

const CATEGORY_THEMES: Record<string, CategoryConfig> = {
    latest: {
        icon: Zap,
        description: "Fresh off the press. The newest markets and insights.",
        gradient: "from-yellow-500/20 via-orange-500/10 to-background",
        accentColor: "text-yellow-500"
    },
    politics: {
        icon: Globe,
        description: "Global elections, policy shifts, and geopolitical events.",
        gradient: "from-blue-600/20 via-red-500/10 to-background",
        accentColor: "text-blue-500"
    },
    finance: {
        icon: TrendingUp,
        description: "Stocks, commodities, and fiat currency movements.",
        gradient: "from-green-500/20 via-emerald-600/10 to-background",
        accentColor: "text-green-500"
    },
    tech: {
        icon: Cpu,
        description: "AI breakthroughs, hardware launches, and startup news.",
        gradient: "from-cyan-500/20 via-blue-600/10 to-background",
        accentColor: "text-cyan-500"
    },
    crypto: {
        icon: Bitcoin,
        description: "Digital assets, DeFi protocols, and blockchain tech.",
        gradient: "from-orange-500/20 via-amber-500/10 to-background",
        accentColor: "text-orange-500"
    },
    economy: {
        icon: DollarSign,
        description: "Macro trends, inflation rates, and central bank policies.",
        gradient: "from-indigo-500/20 via-violet-500/10 to-background",
        accentColor: "text-indigo-500"
    },
    science: {
        icon: Activity,
        description: "Space exploration, medical discoveries, and climate data.",
        gradient: "from-rose-500/20 via-pink-500/10 to-background",
        accentColor: "text-rose-500"
    },
    default: {
        icon: Newspaper,
        description: "Explore AI agent competitions and real-time insights.",
        gradient: "from-primary/20 via-primary/5 to-background",
        accentColor: "text-primary"
    }
};

export const CategoryHeader = memo(function CategoryHeader({ category, title }: CategoryHeaderProps) {
    // Normalize category key safely
    const normalizedCategory = category.toLowerCase().replace(/\s+/g, '-');
    const theme = CATEGORY_THEMES[normalizedCategory] || CATEGORY_THEMES[Object.keys(CATEGORY_THEMES).find(k => normalizedCategory.includes(k)) || 'default'];

    const Icon = theme.icon;
    const displayTitle = title || category;

    return (
        <div className="relative w-full overflow-hidden rounded-3xl border border-white/5 bg-card/40 backdrop-blur-md shadow-2xl">
            {/* Background Gradient Mesh */}
            <div className={`absolute inset-0 bg-gradient-to-br ${theme.gradient} opacity-80`} />

            {/* Animated Pattern Overlay */}
            <div className="absolute inset-0 opacity-[0.03]"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
                }}
            />

            <div className="relative z-10 px-8 py-12 flex flex-col md:flex-row items-start md:items-center gap-6">

                {/* Icon Container */}
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.5 }}
                    className={`p-4 rounded-2xl bg-background/50 backdrop-blur-xl border border-white/10 shadow-lg ${theme.accentColor}`}
                >
                    <Icon className="w-10 h-10" strokeWidth={1.5} />
                </motion.div>

                <div className="flex-1 space-y-2">
                    <motion.h1
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                        className="text-4xl md:text-5xl font-black tracking-tight text-foreground capitalize"
                    >
                        {displayTitle}
                    </motion.h1>

                    <motion.p
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="text-lg text-muted-foreground/90 font-medium max-w-2xl"
                    >
                        {theme.description}
                    </motion.p>
                </div>

                {/* Decorative Stats or Tags could go here in future */}
                <div className="hidden lg:block opacity-30">
                    <Icon className="w-64 h-64 absolute -right-10 -bottom-20 rotate-12" />
                </div>
            </div>
        </div>
    );
});
