import { motion } from "motion/react";
import { BarChart2, History, Trophy, Gift, LayoutDashboard } from "lucide-react";

interface NavIconProps {
    active?: boolean;
}

// 1. Markets: Animated Bars
export function MarketsIcon({ active = false }: NavIconProps) {
    return (
        <div className="relative flex items-center justify-center w-6 h-6">
            <BarChart2
                className={`w-5 h-5 transition-colors duration-300 ${active ? "text-cyan-400" : "text-muted-foreground group-hover:text-foreground"}`}
            />
            {active && (
                <motion.div
                    layoutId="nav-glow"
                    className="absolute inset-0 bg-cyan-400/20 blur-md rounded-full"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                />
            )}
        </div>
    );
}

// 2. Dashboards: Animated Grid
export function DashboardIcon({ active = false }: NavIconProps) {
    return (
        <div className="relative flex items-center justify-center w-6 h-6">
            <LayoutDashboard
                className={`w-5 h-5 transition-colors duration-300 ${active ? "text-cyan-400" : "text-muted-foreground group-hover:text-foreground"}`}
            />
            {active && (
                <motion.div
                    className="absolute inset-0 bg-cyan-400/20 blur-md rounded-full"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                />
            )}
        </div>
    );
}

// 3. Activity: History
export function ActivityIcon({ active = false }: NavIconProps) {
    return (
        <div className="relative flex items-center justify-center w-6 h-6">
            <History
                className={`w-5 h-5 transition-colors duration-300 ${active ? "text-cyan-400" : "text-muted-foreground group-hover:text-foreground"}`}
            />
            {active && (
                <motion.div
                    className="absolute inset-0 bg-cyan-400/20 blur-md rounded-full"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                />
            )}
        </div>
    );
}

// 4. Ranks: Trophy
export function RanksIcon({ active = false }: NavIconProps) {
    return (
        <div className="relative flex items-center justify-center w-6 h-6">
            <Trophy
                className={`w-5 h-5 transition-colors duration-300 ${active ? "text-cyan-400" : "text-muted-foreground group-hover:text-foreground"}`}
            />
            {active && (
                <motion.div
                    className="absolute inset-0 bg-yellow-400/20 blur-md rounded-full"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                />
            )}
        </div>
    );
}

// 5. Rewards: Gift Shake
export function RewardsIcon({ active = false }: NavIconProps) {
    return (
        <div className="relative flex items-center justify-center w-6 h-6">
            <motion.div
                animate={active ? { rotate: [0, -10, 10, -10, 10, 0] } : {}}
                transition={{ duration: 0.5, repeat: active ? Infinity : 0, repeatDelay: 2 }}
            >
                <Gift
                    className={`w-5 h-5 transition-colors duration-300 ${active ? "text-pink-400" : "text-muted-foreground group-hover:text-foreground"}`}
                />
            </motion.div>
            {active && (
                <motion.div
                    className="absolute inset-0 bg-pink-400/20 blur-md rounded-full"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                />
            )}
        </div>
    );
}

// Wrapper to export mapped by name for easy replacement
export const NavIcons = {
    Markets: MarketsIcon,
    Dashboards: DashboardIcon,
    Activity: ActivityIcon,
    Ranks: RanksIcon,
    Rewards: RewardsIcon,
};
