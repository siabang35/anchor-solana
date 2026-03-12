import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { TrendingUp, Star, ChevronRight, X, LogIn, UserPlus, LogOut, Shield } from "lucide-react";
import { Button } from "./ui/button";
import { useAuth } from "./auth/AuthContext";
import { useAdmin } from "../contexts/AdminContext";
import { useDeposit } from "../contexts/DepositContext";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAuth?: (mode?: 'login' | 'signup') => void;
  // Add onNavigate prop to sidebar to allow navigation
  onNavigate?: (tab: string) => void;
}

export function Sidebar({ isOpen, onClose, onOpenAuth }: SidebarProps) {
  const navigate = useNavigate();
  const { isAuthenticated, logout, user } = useAuth();
  const { isAdmin } = useAdmin();
  const { openDepositModal } = useDeposit();
  const [imgError, setImgError] = useState(false);

  // Safe navigation helper - prevents throttling by closing sidebar first
  const handleNavigate = (path: string) => {
    onClose();
    // Small delay to allow sidebar animation to start before navigation
    requestAnimationFrame(() => navigate(path));
  };

  useEffect(() => {
    if (user?.avatarUrl) {
      setImgError(false);
    }
  }, [user?.avatarUrl]);

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 right-0 h-screen w-80 bg-card border-l border-border z-50 lg:z-0 transition-transform duration-300 lg:translate-x-0 overflow-y-auto custom-scrollbar ${isOpen ? "translate-x-0" : "translate-x-full"
          }`}
      >
        <div className="p-6 space-y-6">
          {/* Mobile Header */}
          <div className="flex items-center justify-between lg:hidden mb-2">
            <span className="font-rajdhani font-bold text-xl tracking-wide">Menu</span>
            <button
              onClick={onClose}
              className="p-2 hover:bg-accent rounded-full transition-colors active:scale-95"
              aria-label="Close Menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mobile Profile Header (Authenticated) */}
          {isAuthenticated && (
            <div className="lg:hidden flex items-center gap-3 mb-2 p-3 rounded-xl bg-secondary/30 border border-border/50">
              {/* Use the user data from useAuth, assuming it's available in the context */}
              {/* We need to access 'user' from useAuth, so let's make sure it's destructured */}
              <div className="relative">
                {/* Try avatarUrl, and fallback to initials if missing or broken */}
                {user?.avatarUrl && !imgError ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.fullName || 'Profile'}
                    className="w-10 h-10 rounded-full object-cover border border-border bg-muted"
                    onError={() => setImgError(true)}
                  />
                ) : null}

                <div className={`w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-medium border border-border ${user?.avatarUrl && !imgError ? 'hidden' : ''}`}>
                  {user?.fullName
                    ? user.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                    : user?.email?.[0].toUpperCase() || 'U'}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm truncate">{user?.fullName || 'User'}</h3>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            </div>
          )}

          {/* Auth Section (Guest Only) */}
          {!isAuthenticated && (
            <div className="rounded-xl bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20 p-5">
              <h3 className="font-semibold mb-2">Join ExoDuZe</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Sign up to start predicting and earning rewards.
              </p>
              <div className="space-y-2">
                <Button
                  className="w-full bg-primary text-primary-foreground"
                  onClick={() => onOpenAuth?.('signup')}
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Sign Up
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => onOpenAuth?.('login')}
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  Log In
                </Button>
              </div>
            </div>
          )}

          {/* Portfolio Section (User Only) */}
          {isAuthenticated && (
            <div className="space-y-6">
              <div className="rounded-xl bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-5 h-5 text-purple-500" />
                  <h3 className="font-semibold">Portfolio</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Deposit some cash to start betting
                </p>
                <Button
                  onClick={() => openDepositModal()}
                  className="w-full rounded-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]">
                  Deposit
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>

              {isAdmin && (
                <Button
                  variant="ghost"
                  className="w-full border border-yellow-500/20 bg-yellow-500/5 text-yellow-500 hover:bg-yellow-500/10 hover:border-yellow-500/40 transition-all duration-300 group"
                  onClick={() => handleNavigate('/admin')}
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Admin Dashboard
                </Button>
              )}

              <Button
                variant="ghost"
                className="w-full border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 hover:border-red-300 dark:hover:border-red-800 transition-all duration-300 group"
                onClick={logout}
              >
                <LogOut className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform duration-300" />
                Log Out
              </Button>
            </div>
          )}

          {/* AI Quant Competition */}
          <div className="rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🧠</span>
              <h3 className="font-semibold">AI Quant Competition</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Deploy AI agents to compete in probability forecasting.
            </p>
            <Button
              onClick={() => handleNavigate('/competition')}
              className="w-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]">
              Enter Competition
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </div>

          {/* Watchlist Section */}
          <div className="rounded-xl bg-accent/50 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-5 h-5 text-yellow-500" />
              <h3 className="font-semibold">Watchlist</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Click the star on any market to add it to your list
            </p>
            <Button variant="outline" className="w-full rounded-full">
              Trending
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </div>

          {/* Trending Topics */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Trending Topics</h3>
              <a href="#" className="text-sm text-primary hover:underline">
                See all
              </a>
            </div>
            <div className="space-y-2">
              <TopicBadge>Wildfire</TopicBadge>
              <TopicBadge>Breaking News</TopicBadge>
              <TopicBadge>Canada</TopicBadge>
              <TopicBadge>Trump Inauguration</TopicBadge>
              <TopicBadge>Trump Presidency</TopicBadge>
              <TopicBadge>2025 AI Competitions</TopicBadge>
              <TopicBadge>Geopolitics</TopicBadge>
              <TopicBadge>NFL Draft</TopicBadge>
              <TopicBadge>Elon Musk</TopicBadge>
              <TopicBadge>Middle East</TopicBadge>
              <TopicBadge>Bitcoin</TopicBadge>
              <TopicBadge>Cyber Truck</TopicBadge>
              <TopicBadge>Bird Flu</TopicBadge>
              <TopicBadge>Weather</TopicBadge>
              <TopicBadge>German Election</TopicBadge>
            </div>
          </div>

          {/* Recent Activity */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Recent Activity</h3>
              <a href="#" className="text-sm text-primary hover:underline">
                See all
              </a>
            </div>
            <div className="space-y-3">
              <ActivityItem
                title="Will EU impose new AFC Championship..."
                subtitle="Placeholder bought: No at 16¢"
                change="+$53.03"
                positive
              />
              <ActivityItem
                title="Will Elon musk reach 600 to 624 million Jan 3..."
                subtitle="Oct 26/YU27/1986 - bought: Yes at 16¢"
                change="+224.43"
                positive
              />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function TopicBadge({ children }: { children: React.ReactNode }) {
  return (
    <button className="w-full text-left px-3 py-2 rounded-lg bg-accent/50 hover:bg-accent transition-colors text-sm">
      {children}
    </button>
  );
}

function ActivityItem({
  title,
  subtitle,
  change,
  positive = false,
}: {
  title: string;
  subtitle: string;
  change: string;
  positive?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-accent/30 hover:bg-accent/50 transition-colors cursor-pointer">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm line-clamp-1 mb-1">{title}</p>
        <p className="text-xs text-muted-foreground line-clamp-1">{subtitle}</p>
      </div>
      <span
        className={`text - sm font - medium whitespace - nowrap ${positive ? "text-green-500" : "text-red-500"
          } `}
      >
        {change}
      </span>
    </div>
  );
}