import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    User,
    Shield,
    Wallet,
    Code,
    Key,
    Upload,
    LogOut,
    Plus,
    Palette,
    Moon,
    Sun,
    Laptop,
    ChevronRight,
    Search,
    Loader2,
    CheckCircle2,
    X,
    ChevronLeft
} from 'lucide-react';
import { useDeposit } from '../../contexts/DepositContext';
import { Button } from '../../components/ui/button';
import { useAuth } from '../../components/auth/AuthContext';
import { cn } from '../../components/ui/utils';
import { userApi } from '../../../services/api';
import { Toast } from '../../components/Toast';
import { useTheme } from '../../components/ThemeProvider';
import { Input } from '../../components/ui/input';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { ProfileCompletionModal } from '../../components/auth/ProfileCompletionModal';

type SettingsTab = 'profile' | 'wallets' | 'appearance' | 'security' | 'builder' | 'keys';

// Custom X (formerly Twitter) Logo SVG
const XLogo = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
);

export function SettingsPage() {
    const { user, logout, refreshUser, isLoading: authLoading } = useAuth();
    const { balance, openDepositModal } = useDeposit();
    const { theme, setTheme } = useTheme();

    const [activeTab, setActiveTab] = useState<SettingsTab | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();

    // Profile completion modal state
    const [showProfileCompletion, setShowProfileCompletion] = useState(false);

    // Responsive State
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

    useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth < 1024;
            setIsMobile(mobile);
            if (!mobile && !activeTab) {
                setActiveTab('profile');
            }
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [activeTab]);

    // Check for profile completion URL param (after Google OAuth)
    useEffect(() => {
        if (searchParams.get('complete_profile') === 'true') {
            setShowProfileCompletion(true);
            // Clear the URL param
            setSearchParams({}, { replace: true });
        }
    }, [searchParams, setSearchParams]);

    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // Form states
    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    const [bio, setBio] = useState('');

    // Wallet form state
    const [newWalletAddress, setNewWalletAddress] = useState('');
    const [newWalletChain, setNewWalletChain] = useState('ethereum');

    useEffect(() => {
        if (user) {
            setEmail(user.email || '');
            setUsername(user.fullName || '');
            setBio(user.bio || '');
        }
    }, [user]);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleSaveProfile = async () => {
        setIsLoading(true);
        const payload = { fullName: username, bio: bio };
        try {
            await userApi.updateProfile(payload);
            await refreshUser();
            showToast('Profile updated successfully', 'success');
        } catch (error) {
            showToast('Failed to update profile.', 'error');
            console.error('Profile update failed:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleConnectTwitter = () => {
        showToast('Connecting to X...', 'success');
    };

    const handleAddWallet = async () => {
        if (!newWalletAddress) return;
        setIsLoading(true);
        try {
            await userApi.addWallet(newWalletAddress, newWalletChain);
            await refreshUser();
            setNewWalletAddress('');
            showToast('Wallet added successfully', 'success');
        } catch (error) {
            showToast('Failed to add wallet', 'error');
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRemoveWallet = async (address: string, chain: string) => {
        // eslint-disable-next-line no-restricted-globals
        if (!confirm('Are you sure you want to remove this wallet?')) return;
        setIsLoading(true);
        try {
            await userApi.removeWallet(address, chain);
            await refreshUser();
            showToast('Wallet removed successfully', 'success');
        } catch (error) {
            showToast('Failed to remove wallet', 'error');
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const navItems = [
        { id: 'profile', label: 'Profile', icon: <User className="w-5 h-5" />, desc: 'Personal details', color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
        { id: 'wallets', label: 'Wallets', icon: <Wallet className="w-5 h-5" />, desc: 'Manage connections', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
        { id: 'appearance', label: 'Appearance', icon: <Palette className="w-5 h-5" />, desc: 'Theme & UI', color: 'text-purple-500', bg: 'bg-purple-500/10' },
        { id: 'security', label: 'Security', icon: <Shield className="w-5 h-5" />, desc: 'Password & 2FA', color: 'text-orange-500', bg: 'bg-orange-500/10' },
        { id: 'builder', label: 'Builder Codes', icon: <Code className="w-5 h-5" />, desc: 'Developer access', color: 'text-blue-500', bg: 'bg-blue-500/10' },
        { id: 'keys', label: 'Export Keys', icon: <Key className="w-5 h-5" />, desc: 'Backup access', color: 'text-red-500', bg: 'bg-red-500/10' },
    ];

    const containerVariants: Variants = {
        hidden: { opacity: 0, x: 20 },
        visible: { opacity: 1, x: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
        exit: { opacity: 0, x: -20, transition: { duration: 0.2 } }
    };

    const listItemVariants: Variants = {
        hidden: { opacity: 0, y: 10 },
        visible: (i: number) => ({
            opacity: 1,
            y: 0,
            transition: {
                delay: i * 0.05,
                duration: 0.3,
                ease: "easeOut" as const
            }
        })
    };

    if (authLoading) {
        return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
    }

    const renderContent = () => {
        if (!activeTab && isMobile) return null;

        switch (activeTab) {
            case 'profile':
                return (
                    <motion.div variants={containerVariants} initial="hidden" animate="visible" exit="exit" className="space-y-8">
                        {/* Profile Header Card */}
                        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600/10 via-purple-500/10 to-blue-500/10 border border-white/10 p-8 shadow-2xl shadow-indigo-500/5">
                            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                                <User className="w-48 h-48 rotate-[-15deg]" />
                            </div>
                            <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-start gap-8">
                                <div className="group relative">
                                    <div className="w-32 h-32 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 p-[3px] shadow-xl shadow-indigo-500/20">
                                        <div className="w-full h-full rounded-full overflow-hidden bg-background relative">
                                            {user?.avatarUrl ? (
                                                <img src={user.avatarUrl} alt="Profile" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-muted-foreground bg-secondary">
                                                    {(username?.[0] || user?.email?.[0] || 'U').toUpperCase()}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => document.getElementById('avatar-upload')?.click()}
                                        className="absolute bottom-2 right-2 p-2.5 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-transform hover:scale-105 active:scale-95"
                                    >
                                        <Upload className="w-4 h-4" />
                                    </button>
                                    <input
                                        type="file"
                                        id="avatar-upload"
                                        className="hidden"
                                        accept="image/*"
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                setIsLoading(true);
                                                try {
                                                    await userApi.uploadAvatar(file);
                                                    await refreshUser();
                                                    showToast('Avatar updated', 'success');
                                                } catch (err) {
                                                    showToast('Upload failed', 'error');
                                                } finally {
                                                    setIsLoading(false);
                                                }
                                            }
                                        }}
                                    />
                                </div>
                                <div className="text-center sm:text-left space-y-3 flex-1">
                                    <div>
                                        <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">{username || 'User'}</h2>
                                        <p className="text-muted-foreground font-medium">{user?.email || 'No email connected'}</p>
                                    </div>
                                    <div className="flex gap-2 justify-center sm:justify-start flex-wrap">
                                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-green-500/10 text-green-500 border border-green-500/20 shadow-sm shadow-green-500/5">
                                            Active Account
                                        </span>
                                        {user?.email && (
                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-500 border border-blue-500/20 shadow-sm shadow-blue-500/5">
                                                Verified User
                                            </span>
                                        )}
                                    </div>

                                    <div className="pt-3">
                                        <Button
                                            onClick={handleConnectTwitter}
                                            variant="outline"
                                            size="sm"
                                            className="h-9 px-4 gap-2.5 bg-background/50 hover:bg-background border-foreground/10 hover:border-foreground/20 transition-all w-full sm:w-auto font-medium"
                                        >
                                            <XLogo className="w-3.5 h-3.5" />
                                            Connect X
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Edit Form */}
                        <div className="grid gap-8 max-w-3xl">
                            <div className="grid gap-6 md:grid-cols-2">
                                <div className="space-y-2.5">
                                    <label className="text-sm font-semibold text-foreground/80 ml-1">Username</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-muted-foreground">
                                            @
                                        </div>
                                        <Input
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            className="pl-8 bg-secondary/30 border-border/50 focus:bg-background focus:border-primary/50 transition-all h-12 rounded-xl"
                                            placeholder="username"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2.5">
                                    <label className="text-sm font-semibold text-foreground/80 ml-1 flex items-center gap-2">
                                        Email Address
                                        {!user?.email && <span className="text-xs font-normal text-amber-500">(Recommended)</span>}
                                        {user?.email && user?.emailVerified && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-500/10 text-green-500 border border-green-500/20">
                                                <CheckCircle2 className="w-3 h-3 mr-1" /> Verified
                                            </span>
                                        )}
                                        {user?.email && !user?.emailVerified && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                                Unverified
                                            </span>
                                        )}
                                    </label>
                                    <div className="flex gap-2">
                                        <Input
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            readOnly={!!user?.email}
                                            className={cn(
                                                "h-12 rounded-xl transition-all flex-1",
                                                user?.email
                                                    ? "bg-muted/30 border-border/30 text-muted-foreground/80 cursor-not-allowed"
                                                    : "bg-secondary/30 border-border/50 focus:bg-background focus:border-primary/50"
                                            )}
                                            placeholder="Connect an email..."
                                        />
                                        {/* Add new email - Send verification link */}
                                        {!user?.email && email && (
                                            <Button
                                                onClick={async () => {
                                                    if (!email) return;
                                                    setIsLoading(true);
                                                    try {
                                                        await userApi.requestEmailVerification(email);
                                                        showToast('Verification link sent! Please check your email.', 'success');
                                                    } catch (err: any) {
                                                        showToast(err.message || 'Failed to send verification link', 'error');
                                                    } finally {
                                                        setIsLoading(false);
                                                    }
                                                }}
                                                disabled={isLoading || !email.includes('@')}
                                                className="h-12 px-5 rounded-xl bg-primary hover:bg-primary/90 whitespace-nowrap"
                                            >
                                                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Link'}
                                            </Button>
                                        )}
                                        {/* Resend verification link for unverified email */}
                                        {user?.email && !user?.emailVerified && (
                                            <Button
                                                onClick={async () => {
                                                    setIsLoading(true);
                                                    try {
                                                        await userApi.requestEmailVerification(user.email!);
                                                        showToast('Verification link sent! Please check your email.', 'success');
                                                    } catch (err: any) {
                                                        showToast(err.message || 'Failed to send verification link', 'error');
                                                    } finally {
                                                        setIsLoading(false);
                                                    }
                                                }}
                                                disabled={isLoading}
                                                variant="outline"
                                                className="h-12 px-5 rounded-xl border-amber-500/30 text-amber-600 hover:bg-amber-500/10 whitespace-nowrap"
                                            >
                                                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Resend Link'}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2.5">
                                <label className="text-sm font-semibold text-foreground/80 ml-1">Bio</label>
                                <textarea
                                    value={bio}
                                    onChange={(e) => setBio(e.target.value)}
                                    placeholder="Tell the world about yourself..."
                                    className="flex w-full rounded-xl border border-border/50 bg-secondary/30 px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none h-32 focus:bg-background focus:border-primary/50 transition-all"
                                />
                            </div>

                            <div className="flex justify-end pt-4 border-t border-border/40">
                                <Button
                                    onClick={handleSaveProfile}
                                    disabled={isLoading}
                                    className="w-full sm:w-auto min-w-[160px] rounded-xl text-base font-semibold shadow-lg shadow-primary/20"
                                    size="lg"
                                >
                                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                    {isLoading ? 'Saving Changes...' : 'Save Changes'}
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                );

            case 'wallets':
                return (
                    <motion.div variants={containerVariants} initial="hidden" animate="visible" exit="exit" className="space-y-8">
                        {/* Balance Card */}
                        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-900/60 via-teal-900/40 to-background border border-emerald-500/20 p-8 md:p-10 shadow-2xl shadow-emerald-500/10">
                            <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
                            <div className="absolute bottom-0 left-0 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl -ml-10 -mb-10 pointer-events-none" />

                            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                                <div>
                                    <p className="text-sm font-bold text-emerald-400 mb-2 uppercase tracking-widest flex items-center gap-2">
                                        <Wallet className="w-4 h-4" /> Total Balance
                                    </p>
                                    <div className="flex items-baseline gap-3">
                                        <span className="text-5xl sm:text-6xl font-bold font-rajdhani text-white tracking-tight">
                                            {balance ? Number(balance.availableBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                                        </span>
                                        <span className="text-2xl font-semibold text-emerald-200/60">USDC</span>
                                    </div>
                                </div>
                                <Button
                                    onClick={() => openDepositModal()}
                                    className="bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl shadow-lg shadow-emerald-500/30 h-14 px-8 text-base font-bold transition-all hover:scale-105 active:scale-95 w-full md:w-auto"
                                >
                                    <Plus className="w-5 h-5 mr-2" />
                                    Deposit Funds
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-5">
                            <div className="flex items-center justify-between px-1">
                                <h3 className="text-xl font-bold tracking-tight">Connected Wallets</h3>
                                <span className="text-xs font-semibold text-muted-foreground bg-secondary/50 px-3 py-1 rounded-full border border-border/50">
                                    {user?.walletAddresses?.length || 0} Linked
                                </span>
                            </div>

                            <div className="grid gap-4">
                                <AnimatePresence>
                                    {user?.walletAddresses?.map((wallet, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            transition={{ delay: i * 0.1 }}
                                            className="group flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 rounded-2xl bg-card border border-border/50 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
                                        >
                                            <div className="flex items-center gap-5 w-full sm:w-auto">
                                                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/5 to-indigo-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20 group-hover:scale-105 transition-transform">
                                                    <Wallet className="w-6 h-6" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-3 mb-1">
                                                        <p className="font-bold text-lg capitalize text-foreground">{wallet.chain}</p>
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                                                            Primary
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-muted-foreground font-mono truncate max-w-[220px] sm:max-w-[350px] bg-secondary/30 px-2 py-1 rounded-md">
                                                        {wallet.address}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 mt-4 sm:mt-0 w-full sm:w-auto justify-end">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(wallet.address);
                                                        showToast('Address copied', 'success');
                                                    }}
                                                    className="text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg"
                                                >
                                                    Copy
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleRemoveWallet(wallet.address, wallet.chain)}
                                                    className="text-red-500/70 hover:text-red-500 hover:bg-red-500/10 rounded-lg"
                                                >
                                                    Unlink
                                                </Button>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>

                                <div className="mt-2 p-6 rounded-2xl border-2 border-dashed border-border/40 bg-card/20 hover:bg-card/40 transition-colors">
                                    <h4 className="font-semibold text-base mb-5 flex items-center gap-2">
                                        <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                                            <Plus className="w-4 h-4" />
                                        </div>
                                        Link New Wallet
                                    </h4>
                                    <div className="flex flex-col sm:flex-row gap-4">
                                        <div className="flex-1 relative group">
                                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                            <Input
                                                placeholder="Enter wallet address (0x...)"
                                                value={newWalletAddress}
                                                onChange={(e) => setNewWalletAddress(e.target.value)}
                                                className="pl-11 h-12 bg-background border-border/50 rounded-xl focus:ring-2 focus:ring-primary/20"
                                            />
                                        </div>
                                        <div className="flex gap-3">
                                            <div className="relative">
                                                <select
                                                    className="h-12 px-4 pr-10 rounded-xl bg-background border border-border/50 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 hover:bg-secondary/50 transition-colors appearance-none cursor-pointer min-w-[140px]"
                                                    value={newWalletChain}
                                                    onChange={(e) => setNewWalletChain(e.target.value)}
                                                >
                                                    <option value="ethereum">Ethereum</option>
                                                    <option value="base">Base</option>
                                                    <option value="solana">Solana</option>
                                                    <option value="sui">Sui</option>
                                                </select>
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                                                    <ChevronRight className="w-4 h-4 rotate-90" />
                                                </div>
                                            </div>

                                            <Button
                                                onClick={handleAddWallet}
                                                disabled={isLoading || !newWalletAddress}
                                                className="whitespace-nowrap h-12 px-6 rounded-xl font-semibold"
                                            >
                                                {isLoading ? 'Linking...' : 'Link Wallet'}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                );

            case 'appearance':
                return (
                    <motion.div variants={containerVariants} initial="hidden" animate="visible" exit="exit" className="space-y-8">
                        <div>
                            <h3 className="text-2xl font-bold mb-2">Theme Preferences</h3>
                            <p className="text-muted-foreground text-lg">Choose how ExoDuZe looks to you.</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                            {[
                                { id: 'light', label: 'Light Mode', icon: Sun, color: 'text-amber-500', bg: 'bg-white' },
                                { id: 'dark', label: 'Dark Mode', icon: Moon, color: 'text-indigo-400', bg: 'bg-slate-950' },
                                { id: 'system', label: 'System Default', icon: Laptop, color: 'text-primary', bg: 'bg-gradient-to-br from-slate-100 to-slate-900' }
                            ].map((mode) => (
                                <button
                                    key={mode.id}
                                    onClick={() => setTheme(mode.id as any)}
                                    className={cn(
                                        "group flex flex-col items-center gap-5 p-5 rounded-3xl border-2 transition-all duration-300 relative overflow-hidden",
                                        theme === mode.id
                                            ? "border-primary bg-primary/5 ring-4 ring-primary/10 scale-[1.02]"
                                            : "border-border/50 hover:border-primary/50 hover:bg-accent/30"
                                    )}
                                >
                                    <div className={cn(
                                        "w-full aspect-video rounded-2xl border border-border/10 shadow-lg flex items-center justify-center relative overflow-hidden transition-all group-hover:scale-105 group-hover:shadow-xl",
                                        mode.bg
                                    )}>
                                        <div className={cn("p-5 rounded-full bg-background/90 backdrop-blur-md shadow-sm transition-transform group-hover:rotate-12", mode.color)}>
                                            <mode.icon className="w-10 h-10" />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 font-bold text-lg">
                                        {mode.label}
                                        {theme === mode.id && <CheckCircle2 className="w-5 h-5 text-primary fill-primary/10" />}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </motion.div>
                );

            case 'security':
            case 'builder':
            case 'keys':
                return (
                    <motion.div variants={containerVariants} initial="hidden" animate="visible" exit="exit" className="space-y-8">
                        <div className="flex flex-col items-center justify-center p-16 text-center bg-gradient-to-b from-card/50 to-background rounded-3xl border border-border/50 border-dashed">
                            <div className="w-24 h-24 rounded-full bg-secondary/50 flex items-center justify-center mb-6 shadow-inner">
                                {activeTab === 'security' && <Shield className="w-10 h-10 text-orange-500" />}
                                {activeTab === 'builder' && <Code className="w-10 h-10 text-blue-500" />}
                                {activeTab === 'keys' && <Key className="w-10 h-10 text-red-500" />}
                            </div>
                            <h2 className="text-3xl font-bold mb-3 capitalize">{navItems.find(i => i.id === activeTab)?.label}</h2>
                            <p className="text-muted-foreground max-w-md mb-8 text-lg">
                                This feature makes ExoDuZe even more powerful. We're putting the finishing touches on it.
                            </p>
                            <Button variant="outline" className="rounded-full px-8 border-primary/20 bg-primary/5 text-primary" disabled>
                                Coming Soon
                            </Button>
                        </div>
                    </motion.div>
                );

            default:
                return null;
        }
    };

    return (
        <div className="min-h-screen bg-background pb-20 lg:pb-0">
            {/* Mobile Header - Glassmorphic */}
            <div className="lg:hidden sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50 px-5 py-4 flex items-center justify-between transition-all">
                <div className="flex items-center gap-3">
                    {activeTab && isMobile ? (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="-ml-2 hover:bg-background/50 rounded-full w-10 h-10"
                            onClick={() => setActiveTab(null)}
                        >
                            <ChevronLeft className="w-6 h-6" />
                        </Button>
                    ) : (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="-ml-2 hover:bg-background/50 rounded-full w-10 h-10"
                            onClick={() => navigate('/markets')}
                        >
                            <X className="w-6 h-6" />
                        </Button>
                    )}
                    <span className="font-bold text-xl tracking-tight">
                        {activeTab && isMobile ? navItems.find(i => i.id === activeTab)?.label : 'Settings'}
                    </span>
                </div>


            </div>

            <div className="container mx-auto max-w-7xl px-4 md:px-6 lg:px-8 py-6 lg:py-12">
                <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 xl:gap-20">

                    {/* Navigation Sidebar / Mobile List */}
                    <aside className={cn(
                        "w-full lg:w-80 flex-shrink-0 space-y-6 lg:space-y-8",
                        isMobile && activeTab ? 'hidden' : 'block'
                    )}>
                        <div className="hidden lg:block space-y-2">
                            <h1 className="text-4xl font-bold tracking-tight text-foreground">Settings</h1>
                            <p className="text-lg text-muted-foreground">Manage your account & preferences</p>
                        </div>

                        {/* Mobile Premium Profile Card */}
                        <div className="lg:hidden mb-8 p-6 rounded-[2rem] bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-800 text-white shadow-xl shadow-indigo-500/20 relative overflow-hidden">
                            {/* Decorative blurs */}
                            <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
                            <div className="absolute bottom-0 left-0 w-32 h-32 bg-black/10 rounded-full blur-2xl -ml-10 -mb-10 pointer-events-none" />

                            <div className="relative z-10 flex items-center gap-5">
                                <div className="w-16 h-16 rounded-full border-[3px] border-white/20 p-1 bg-white/10 backdrop-blur-md shadow-inner">
                                    <div className="w-full h-full rounded-full overflow-hidden bg-black/20 relative">
                                        {user?.avatarUrl ? <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-lg">{(username?.[0] || 'U').toUpperCase()}</div>}
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-xl tracking-tight truncate">{username || 'User'}</h3>
                                    <p className="text-white/80 text-sm truncate">{user?.email}</p>
                                    <div className="flex gap-2 mt-2.5">
                                        <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/20 border border-white/10 backdrop-blur-sm">Active</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <nav className="flex flex-col gap-6">
                            {/* Account Section */}
                            <div className="space-y-3">
                                <h4 className="px-2 text-xs font-bold text-muted-foreground uppercase tracking-widest hidden lg:block">Account</h4>
                                <h4 className="px-1 text-xs font-bold text-muted-foreground uppercase tracking-widest lg:hidden">Account Settings</h4>
                                <div className="space-y-2">
                                    {navItems.slice(0, 2).map((item, i) => (
                                        <motion.button
                                            key={item.id}
                                            custom={i}
                                            variants={listItemVariants}
                                            initial="hidden"
                                            animate="visible"
                                            onClick={() => setActiveTab(item.id as SettingsTab)}
                                            className={cn(
                                                "w-full group flex items-center gap-4 px-4 py-3.5 rounded-2xl text-left transition-all duration-300 relative overflow-hidden",
                                                activeTab === item.id
                                                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 scale-[1.02]"
                                                    : "bg-card hover:bg-secondary/80 hover:scale-[1.01] border border-transparent hover:border-border/50 shadow-sm"
                                            )}
                                        >
                                            <div className="relative z-10 flex items-center gap-4 w-full">
                                                <div className={cn(
                                                    "p-2.5 rounded-xl transition-all duration-300",
                                                    activeTab === item.id
                                                        ? "bg-white/20 text-white rotate-3"
                                                        : cn(item.bg, item.color, "group-hover:scale-110")
                                                )}>
                                                    {item.icon}
                                                </div>
                                                <div className="flex flex-col items-start flex-1 min-w-0">
                                                    <span className={cn("text-base font-semibold truncate", activeTab === item.id ? "text-white" : "text-foreground")}>{item.label}</span>
                                                    <span className={cn(
                                                        "text-xs truncate transition-colors",
                                                        activeTab === item.id ? "text-primary-foreground/80" : "text-muted-foreground"
                                                    )}>
                                                        {item.desc}
                                                    </span>
                                                </div>
                                                <ChevronRight className={cn("w-5 h-5 transition-transform", activeTab === item.id ? "text-white opacity-100 translate-x-1" : "text-muted-foreground opacity-30 group-hover:opacity-70 group-hover:translate-x-1")} />
                                            </div>
                                        </motion.button>
                                    ))}
                                </div>
                            </div>

                            {/* Preferences Section */}
                            <div className="space-y-3">
                                <h4 className="px-2 text-xs font-bold text-muted-foreground uppercase tracking-widest hidden lg:block">Preferences</h4>
                                <h4 className="px-1 text-xs font-bold text-muted-foreground uppercase tracking-widest lg:hidden">Preferences & Security</h4>
                                <div className="space-y-2">
                                    {navItems.slice(2).map((item, i) => (
                                        <motion.button
                                            key={item.id}
                                            custom={i + 2} // offset delay
                                            variants={listItemVariants}
                                            initial="hidden"
                                            animate="visible"
                                            onClick={() => setActiveTab(item.id as SettingsTab)}
                                            className={cn(
                                                "w-full group flex items-center gap-4 px-4 py-3.5 rounded-2xl text-left transition-all duration-300 relative overflow-hidden",
                                                activeTab === item.id
                                                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 scale-[1.02]"
                                                    : "bg-card hover:bg-secondary/80 hover:scale-[1.01] border border-transparent hover:border-border/50 shadow-sm"
                                            )}
                                        >
                                            <div className="relative z-10 flex items-center gap-4 w-full">
                                                <div className={cn(
                                                    "p-2.5 rounded-xl transition-all duration-300",
                                                    activeTab === item.id
                                                        ? "bg-white/20 text-white rotate-3"
                                                        : cn(item.bg, item.color, "group-hover:scale-110")
                                                )}>
                                                    {item.icon}
                                                </div>
                                                <div className="flex flex-col items-start flex-1 min-w-0">
                                                    <span className={cn("text-base font-semibold truncate", activeTab === item.id ? "text-white" : "text-foreground")}>{item.label}</span>
                                                    <span className={cn(
                                                        "text-xs truncate transition-colors",
                                                        activeTab === item.id ? "text-primary-foreground/80" : "text-muted-foreground"
                                                    )}>
                                                        {item.desc}
                                                    </span>
                                                </div>
                                                <ChevronRight className={cn("w-5 h-5 transition-transform", activeTab === item.id ? "text-white opacity-100 translate-x-1" : "text-muted-foreground opacity-30 group-hover:opacity-70 group-hover:translate-x-1")} />
                                            </div>
                                        </motion.button>
                                    ))}
                                </div>
                            </div>
                        </nav>

                        <div className="pt-6 lg:pt-8 border-t border-border/50">
                            <Button
                                variant="ghost"
                                onClick={() => logout()}
                                className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-500/10 gap-3 h-14 rounded-2xl text-base font-semibold px-4"
                            >
                                <LogOut className="w-5 h-5" />
                                <span>Sign Out</span>
                            </Button>
                        </div>
                    </aside>

                    {/* Main Content Area */}
                    <main className={cn(
                        "flex-1 min-w-0",
                        isMobile && !activeTab ? 'hidden' : 'block'
                    )}>
                        <div className="lg:bg-card/50 lg:backdrop-blur-sm lg:border lg:border-border/40 lg:rounded-[2.5rem] lg:p-12 min-h-[600px] relative transition-all">
                            <AnimatePresence mode="wait">
                                {renderContent()}
                            </AnimatePresence>
                        </div>
                    </main>
                </div>
            </div>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            {/* Profile Completion Modal - shown after Google OAuth for new users */}
            <ProfileCompletionModal
                isOpen={showProfileCompletion}
                onClose={() => setShowProfileCompletion(false)}
                onComplete={() => {
                    setShowProfileCompletion(false);
                    showToast('Profile completed successfully! Welcome to ExoDuZe.', 'success');
                    // Navigate to profile tab
                    setActiveTab('profile');
                }}
                prefillFullName={user?.fullName}
            />
        </div>
    );
}
