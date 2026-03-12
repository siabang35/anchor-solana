import { useState, useEffect } from 'react';
import {
    LayoutDashboard,
    Users,
    Wallet,
    ShieldAlert,
    LogOut,
    Menu,
    X,
    Bell,
    Search,
    Zap,
    Globe
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../components/auth/AuthContext';

interface AdminLayoutProps {
    children: React.ReactNode;
    onLogout: () => void;
}

export function AdminLayout({ children, onLogout }: AdminLayoutProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();

    // Handlers
    const handleLogout = () => {
        // Exit admin panel without logging out the user session
        navigate('/');
    };

    // Determine active page from path
    const getActivePage = () => {
        const path = location.pathname;
        if (path.includes('/admin/users')) return 'users';
        if (path.includes('/admin/finance')) return 'finance';
        if (path.includes('/admin/security')) return 'security';
        return 'overview';
    };

    const activePage = getActivePage();
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [systemLoad, setSystemLoad] = useState(42);

    // Simulated system load ticker
    useEffect(() => {
        const interval = setInterval(() => {
            setSystemLoad(prev => Math.min(99, Math.max(20, prev + (Math.random() * 10 - 5))));
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    const navItems = [
        { id: 'overview', label: 'Overview', icon: LayoutDashboard, color: 'text-blue-400' },
        { id: 'users', label: 'User Management', icon: Users, color: 'text-purple-400' },
        { id: 'finance', label: 'Finance & Withdrawals', icon: Wallet, color: 'text-emerald-400' },
        { id: 'security', label: 'Security Center', icon: ShieldAlert, color: 'text-red-400' },
    ];

    return (
        <div className="min-h-screen bg-neutral-950 text-white flex font-sans relative overflow-hidden selection:bg-blue-500/30">

            {/* Ambient Background Effects */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-600/5 rounded-full blur-[120px]" />
                <div className="absolute top-[20%] right-[20%] w-[30%] h-[30%] bg-emerald-600/5 rounded-full blur-[100px]" />
                <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] mix-blend-overlay" />
            </div>

            {/* Accessibility: Skip Link */}
            <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-50 px-4 py-2 bg-blue-600 text-white rounded-lg shadow-lg shadow-blue-500/50">
                Skip to main content
            </a>

            {/* Sidebar - Desktop */}
            <motion.aside
                initial={false}
                animate={{ width: isSidebarOpen ? 280 : 80 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="hidden lg:flex flex-col border-r border-white/5 bg-neutral-900/60 backdrop-blur-xl sticky top-0 h-screen z-30"
            >
                <div className="p-6 flex items-center justify-between">
                    <AnimatePresence mode='wait'>
                        {isSidebarOpen ? (
                            <motion.div
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="flex items-center gap-3"
                            >
                                <div className="relative">
                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                                        <Zap size={18} className="text-white fill-current" />
                                    </div>
                                    <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-neutral-900" />
                                </div>
                                <div>
                                    <h1 className="font-bold text-lg tracking-tight text-white leading-none">EXODUZE</h1>
                                    <span className="text-[10px] tracking-widest text-blue-400 font-semibold uppercase">Admin Console</span>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                className="mx-auto"
                            >
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                                    <span className="font-bold text-lg">D</span>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <button
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        className="p-1.5 rounded-lg hover:bg-white/5 text-neutral-400 hover:text-white transition-colors absolute right-4 top-7 lg:static"
                    >
                        {isSidebarOpen ? <X size={16} /> : <Menu size={18} className="mx-auto" />}
                    </button>
                </div>

                <nav className="flex-1 px-4 space-y-1.5 py-6 overflow-y-auto custom-scrollbar">
                    {navItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => navigate(item.id)}
                            className={`w-full flex items-center gap-3 px-3 py-3.5 rounded-xl transition-all duration-200 group relative overflow-hidden ${activePage === item.id
                                ? 'text-white shadow-[0_0_20px_rgba(59,130,246,0.15)]'
                                : 'text-neutral-400 hover:bg-white/5 hover:text-white'
                                }`}
                        >
                            {activePage === item.id && (
                                <motion.div
                                    layoutId="activeTab"
                                    className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-blue-500/5 to-transparent border-l-2 border-blue-500"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                />
                            )}

                            <div className={`relative z-10 p-1 rounded-md transition-colors ${activePage === item.id ? 'bg-blue-500/10 ' + item.color : 'group-hover:text-white bg-transparent'}`}>
                                <item.icon size={20} />
                            </div>

                            {isSidebarOpen && (
                                <motion.span
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="relative z-10 font-medium text-sm"
                                >
                                    {item.label}
                                </motion.span>
                            )}

                            {isSidebarOpen && activePage === item.id && (
                                <motion.div
                                    layoutId="glow"
                                    className="absolute right-3 w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"
                                />
                            )}
                        </button>
                    ))}
                </nav>

                <div className="p-4 border-t border-white/5 bg-neutral-950/30">
                    {isSidebarOpen && (
                        <div className="mb-4 space-y-3">
                            <div className="flex items-center justify-between text-xs text-neutral-500 mb-1">
                                <span>CPU Load</span>
                                <span>{Math.round(systemLoad)}%</span>
                            </div>
                            <div className="h-1 bg-neutral-800 rounded-full overflow-hidden">
                                <motion.div
                                    className="h-full bg-blue-500"
                                    animate={{ width: `${systemLoad}%` }}
                                    transition={{ type: "spring", stiffness: 50 }}
                                />
                            </div>

                            <div className="flex items-center justify-between text-xs text-neutral-500 pt-1">
                                <span className="flex items-center gap-1.5"><Globe size={10} className="text-emerald-500" /> Network</span>
                                <span className="text-emerald-500 font-mono">Stable</span>
                            </div>
                        </div>
                    )}

                    <button
                        onClick={handleLogout}
                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all border border-transparent hover:border-red-500/20 ${!isSidebarOpen && 'justify-center'}`}
                    >
                        <LogOut size={20} />
                        {isSidebarOpen && <span className="font-medium text-sm">Sign Out</span>}
                    </button>
                </div>
            </motion.aside>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 relative z-10">
                {/* Top Header */}
                <header className="h-18 border-b border-white/5 bg-neutral-900/40 backdrop-blur-md sticky top-0 z-20 px-6 lg:px-8 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-4 lg:hidden">
                        <button
                            onClick={() => setIsMobileMenuOpen(true)}
                            className="p-2 -ml-2 text-neutral-400 hover:text-white rounded-lg"
                        >
                            <Menu size={24} />
                        </button>
                        <span className="font-bold text-lg bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">ExoDuZe</span>
                    </div>

                    <div className="hidden lg:flex flex-col">
                        <h2 className="text-white font-semibold text-lg capitalize flex items-center gap-2">
                            {activePage === 'overview' && <LayoutDashboard size={18} className="text-blue-400" />}
                            {activePage === 'users' && <Users size={18} className="text-purple-400" />}
                            {activePage === 'finance' && <Wallet size={18} className="text-emerald-400" />}
                            {activePage === 'security' && <ShieldAlert size={18} className="text-red-400" />}
                            {activePage.replace('_', ' ')}
                        </h2>
                        <div className="flex items-center gap-2 text-xs text-neutral-500">
                            <span>System Status:</span>
                            <span className="flex items-center gap-1.5 text-emerald-500 font-medium">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </span>
                                Operational
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 lg:gap-6">
                        <div className="relative hidden sm:block group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 group-focus-within:text-blue-400 transition-colors" size={16} />
                            <input
                                type="search"
                                placeholder="Search everything..."
                                className="bg-neutral-950/50 border border-white/5 rounded-full pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 w-64 transition-all hover:bg-neutral-900 focus:w-72 shadow-inner"
                            />
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                                <kbd className="hidden group-focus-within:inline-flex h-5 items-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 font-mono text-[10px] font-medium text-neutral-400">
                                    <span className="text-xs">⌘</span>K
                                </kbd>
                            </div>
                        </div>

                        <div className="h-6 w-px bg-white/10 hidden sm:block" />

                        <div className="flex items-center gap-3">
                            <button className="relative p-2.5 rounded-full hover:bg-white/5 text-neutral-400 hover:text-white transition-colors">
                                <Bell size={20} />
                                <span className="absolute top-2 right-2.5 w-2 h-2 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-pulse"></span>
                            </button>

                            <button className="flex items-center gap-3 p-1 rounded-full hover:bg-white/5 transition-colors border border-transparent hover:border-white/5">
                                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold shadow-lg shadow-purple-500/20 ring-2 ring-neutral-900 uppercase">
                                    {user?.email?.slice(0, 2) || 'AD'}
                                </div>
                                <div className="hidden md:block text-left pr-2">
                                    <div className="text-sm font-medium text-white leading-none">
                                        {user?.fullName || 'Admin User'}
                                    </div>
                                    <div className="text-[10px] text-neutral-500 mt-1 max-w-[150px] truncate">
                                        {user?.email || 'admin@exoduze.fi'}
                                    </div>
                                </div>
                            </button>
                        </div>
                    </div>
                </header>

                {/* Content */}
                <main id="main-content" className="flex-1 p-4 lg:p-8 overflow-y-auto custom-scrollbar relative">
                    <div className="max-w-[1600px] mx-auto space-y-6">
                        {children}
                    </div>
                </main>
            </div>

            {/* Mobile Menu Overlay */}
            <AnimatePresence>
                {isMobileMenuOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 lg:hidden"
                        />
                        <motion.aside
                            initial={{ x: '-100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '-100%' }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="fixed inset-y-0 left-0 w-80 bg-neutral-950 border-r border-white/10 z-50 lg:hidden flex flex-col"
                        >
                            <div className="p-6 flex items-center justify-between border-b border-white/5 bg-neutral-900/50">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                                        <Zap size={18} className="text-white fill-current" />
                                    </div>
                                    <span className="font-bold text-xl tracking-tight text-white">EXODUZE</span>
                                </div>
                                <button
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className="p-2 -mr-2 text-neutral-400 hover:text-white"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                                {navItems.map((item) => (
                                    <button
                                        key={item.id}
                                        onClick={() => {
                                            navigate(item.id);
                                            setIsMobileMenuOpen(false);
                                        }}
                                        className={`w-full flex items-center gap-3 px-4 py-4 rounded-xl transition-all duration-200 ${activePage === item.id
                                            ? 'bg-blue-600/10 text-white border border-blue-600/20'
                                            : 'text-neutral-400 hover:bg-white/5 hover:text-white'
                                            }`}
                                    >
                                        <item.icon size={20} className={activePage === item.id ? item.color : ''} />
                                        <span className="font-medium text-lg">{item.label}</span>
                                    </button>
                                ))}
                            </nav>

                            <div className="p-4 border-t border-white/10 bg-neutral-900/50">
                                <button
                                    onClick={onLogout}
                                    className="w-full flex items-center gap-3 px-4 py-4 rounded-xl text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors border border-red-500/10"
                                >
                                    <LogOut size={20} />
                                    <span className="font-medium">Logout</span>
                                </button>
                            </div>
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
