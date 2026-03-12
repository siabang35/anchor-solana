import { useNavigate, useLocation } from "react-router-dom";
import { House, Search, LayoutGrid, PieChart, Activity, Brain } from "lucide-react";
import { useAuth } from "./auth/AuthContext";

interface MobileBottomNavProps {
    currentTab: string;
    onToggleMenu?: () => void;
}

export function MobileBottomNav({ currentTab, onToggleMenu }: MobileBottomNavProps) {
    const navigate = useNavigate();
    const location = useLocation();

    const isTopPicsActive = location.pathname === '/';
    const isForYouActive = location.pathname === '/for-you';

    const { isAuthenticated } = useAuth();

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[60] bg-background/80 backdrop-blur-xl border-t border-border pb-safe transition-colors duration-300">
            <div className="flex items-center justify-between px-6 h-[5rem]">

                <BottomNavItem
                    icon={<House className="w-6 h-6" />}
                    label="Home"
                    active={isTopPicsActive}
                    onClick={() => navigate('/')}
                />

                <BottomNavItem
                    icon={<Search className="w-6 h-6" />}
                    label="Search"
                    active={currentTab === 'search'}
                    onClick={() => navigate('/search')}
                />

                <BottomNavItem
                    icon={<Activity className="w-6 h-6" />}
                    label="For You"
                    active={isForYouActive}
                    onClick={() => navigate('/for-you')}
                />

                <BottomNavItem
                    icon={<Brain className="w-6 h-6" />}
                    label="AI Quant"
                    active={location.pathname.startsWith('/competition')}
                    onClick={() => navigate('/competition')}
                />


                {isAuthenticated ? (
                    <BottomNavItem
                        icon={<PieChart className="w-6 h-6" />}
                        label="Portfolio"
                        active={currentTab === 'dashboards'}
                        onClick={() => navigate('/portfolio')}
                    />
                ) : (
                    <BottomNavItem
                        icon={<LayoutGrid className="w-6 h-6" />}
                        label="More"
                        active={false}
                        onClick={() => onToggleMenu?.()}
                    />
                )}


            </div>
        </div>
    );
}

function BottomNavItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`flex flex-col items-center justify-center gap-1.5 transition-all duration-300 group ${active ? 'scale-105' : 'hover:scale-105'}`}
        >
            <div className={`
                relative p-1.5 rounded-xl transition-all duration-300
                ${active
                    ? 'bg-primary/10 text-primary shadow-[0_0_15px_rgba(var(--primary),0.3)]'
                    : 'text-muted-foreground group-hover:text-foreground hover:bg-accent'
                }
            `}>
                {icon}
            </div>
            <span className={`
                text-[10px] font-medium tracking-wide transition-colors duration-300
                ${active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}
            `}>
                {label}
            </span>
        </button>
    );
}
