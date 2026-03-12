
import { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { PrivyProvider } from "@privy-io/react-auth";
import { ThemeProvider } from "../components/ThemeProvider";
import { AuthProvider } from "../components/auth/AuthContext";
import { AdminProvider } from "../contexts/AdminContext";
import { DepositProvider, useDeposit } from "../contexts/DepositContext";
import { BetSlipProvider } from "../contexts/BetSlipContext";
import { Header } from "../components/Header";
import { Sidebar } from "../components/Sidebar";
import { Footer } from "../components/Footer";
import { MobileMenu } from "../components/MobileMenu";
import { MobileBottomNav } from "../components/MobileBottomNav";
import { DepositModal } from "../components/DepositModal";
import { AuthModal } from "../components/auth/AuthModal";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { ChevronLeft } from "lucide-react";
import { SuiProvider } from "../../providers/SuiProvider";
import { AppKitProvider } from "../../providers/AppKitProvider";

// Privy configuration for embedded wallets
const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || '';

const privyConfig = {
    // Appearance
    appearance: {
        theme: 'dark' as const,
        accentColor: '#6366f1' as `#${string}`, // Indigo-500 to match app theme
        logo: '/logo.png',
    },
    // Embedded wallet configuration (per-chain, latest SDK format)
    embeddedWallets: {
        ethereum: {
            createOnLogin: 'off' as const, // We create wallets manually after profile completion
        },
        solana: {
            createOnLogin: 'off' as const,
        },
    },
    // Login methods - focus on Google OAuth
    loginMethods: ['google' as const, 'email' as const],
};

function RootLayoutContent() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');

    const { isDepositModalOpen, closeDepositModal } = useDeposit();
    const location = useLocation();

    // Helper to determine current tab for highlighting
    const getCurrentTab = () => {
        const path = location.pathname;
        if (path.startsWith('/markets') || path === '/') return 'markets';
        if (path.startsWith('/portfolio')) return 'dashboards';
        if (path.startsWith('/search')) return 'search';
        if (path.startsWith('/notifications')) return 'notifications';
        if (path.startsWith('/admin')) return 'admin';
        return '';
    };

    const handleOpenAuth = (mode?: 'login' | 'signup') => {
        setAuthMode(mode || 'login');
        setIsAuthModalOpen(true);
    };

    // Check for auth query params
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const loginParam = params.get('login');
        const signupParam = params.get('signup');

        if (loginParam === 'true') {
            handleOpenAuth('login');
            // Remove param without refresh
            const newUrl = window.location.pathname + window.location.hash;
            window.history.replaceState({}, '', newUrl);
        } else if (signupParam === 'true') {
            handleOpenAuth('signup');
            const newUrl = window.location.pathname + window.location.hash;
            window.history.replaceState({}, '', newUrl);
        }
    }, [location.search]);

    return (
        <div className="min-h-screen bg-background text-foreground">
            <Header
                currentTab={getCurrentTab()}
                onOpenAuth={handleOpenAuth}
                onToggleMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            />

            <MobileMenu
                isOpen={isMobileMenuOpen}
                onClose={() => setIsMobileMenuOpen(false)}
                onOpenAuth={handleOpenAuth}
            />

            <div className="flex">
                <main className="flex-1 min-w-0">
                    <Outlet context={{ onOpenAuth: handleOpenAuth }} />
                </main>

                {/* Sidebar - Desktop */}
                <div className="hidden lg:block">
                    <Sidebar
                        isOpen={false}
                        onClose={() => { }}
                        onOpenAuth={handleOpenAuth}
                    />
                </div>
            </div>

            {/* Floating Sidebar Toggle - Smart & Persistent */}
            <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className={`lg:hidden fixed top-27 right-0 w-8 h-10 rounded-l-lg rounded-r-none shadow-xl flex items-center justify-center z-[60] transition-all duration-300 border-l border-t border-b border-border/20 backdrop-blur-md ${isSidebarOpen
                    ? "bg-background/80 text-foreground"
                    : "bg-foreground text-background"
                    }`}
                aria-label="Toggle Sidebar"
            >
                <ChevronLeft className={`w-4 h-4 transition-transform duration-300 ${isSidebarOpen ? "rotate-180" : "rotate-0"}`} />
            </button>

            <div className="lg:hidden">
                <Sidebar
                    isOpen={isSidebarOpen}
                    onClose={() => setIsSidebarOpen(false)}
                    onOpenAuth={handleOpenAuth}
                />
            </div>

            <div className="hidden lg:block">
                <Footer />
            </div>

            <DepositModal isOpen={isDepositModalOpen} onClose={closeDepositModal} />
            <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} initialMode={authMode} />

            <div className="lg:hidden">
                <MobileBottomNav
                    currentTab={getCurrentTab()}
                    onToggleMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                />
            </div>
        </div>
    );
}

export function RootLayout() {
    // Only render PrivyProvider if configured
    const hasPrivy = !!PRIVY_APP_ID;

    const content = (
        <ErrorBoundary>
            <ThemeProvider>
                <SuiProvider>
                    <AppKitProvider>
                        <AuthProvider>
                            <DepositProvider>
                                <BetSlipProvider>
                                    <AdminProvider>
                                        <RootLayoutContent />
                                    </AdminProvider>
                                </BetSlipProvider>
                            </DepositProvider>
                        </AuthProvider>
                    </AppKitProvider>
                </SuiProvider>
            </ThemeProvider>
        </ErrorBoundary>
    );

    // Wrap with PrivyProvider if configured
    if (hasPrivy) {
        return (
            <PrivyProvider
                appId={PRIVY_APP_ID}
                config={privyConfig}
            >
                {content}
            </PrivyProvider>
        );
    }

    return content;
}
