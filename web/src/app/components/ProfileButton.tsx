import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { type User as AuthUser, useAuth } from './auth/AuthContext';
import { useDeposit } from '../contexts/DepositContext';
import { cn } from './ui/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
    LayoutDashboard,
    Wallet,
    Settings,
    LogOut,
} from 'lucide-react';

interface ProfileButtonProps {
    user: AuthUser;
    mobile?: boolean;
    triggerOnly?: boolean;
    children?: React.ReactNode;
    onNavigate?: (tab: string) => void;
}

export function ProfileButton({ user, mobile, triggerOnly, children }: ProfileButtonProps) {
    const navigate = useNavigate();
    const { logout } = useAuth();
    const { openDepositModal, balance } = useDeposit();

    // Get initials for avatar
    const getInitials = (name?: string, email?: string) => {
        if (name) {
            return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        }
        if (email) {
            return email[0].toUpperCase();
        }
        return 'U';
    };

    const initials = getInitials(user.fullName, user.email);
    const displayName = user.fullName || user.email?.split('@')[0] || 'User';

    const AvatarCircle = () => (
        user.avatarUrl ? (
            <img
                src={user.avatarUrl}
                alt={displayName}
                className="w-10 h-10 rounded-full object-cover border-2 border-border"
            />
        ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-medium border-2 border-border">
                {initials}
            </div>
        )
    );

    const handleOpenSettings = () => {
        navigate('/settings');
    };

    if (mobile) {
        // Mobile trigger - usually rendered inside the drawer or sidebar, but if used as a trigger button:
        return (
            <>
                {triggerOnly && children ? (
                    <div onClick={handleOpenSettings} className="cursor-pointer">
                        {children}
                    </div>
                ) : (
                    <button
                        onClick={handleOpenSettings}
                        className="flex items-center gap-3 w-full p-2 rounded-xl hover:bg-accent/10 transition-colors"
                    >
                        <AvatarCircle />
                        <div className="flex flex-col items-start text-left">
                            <span className="font-semibold text-lg">{displayName}</span>
                            <span className="text-sm text-muted-foreground">View Profile & Settings</span>
                        </div>
                    </button>
                )}
            </>
        );
    }

    // Desktop View
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    className={cn(
                        "flex items-center gap-2 px-2 py-1.5 h-auto rounded-full hover:bg-accent/50 transition-all focus-visible:ring-0 focus-visible:ring-offset-0",
                    )}
                >
                    {user.avatarUrl ? (
                        <img
                            src={user.avatarUrl}
                            alt={displayName}
                            className="w-8 h-8 rounded-full object-cover shadow-sm"
                        />
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-medium shadow-sm">
                            {initials}
                        </div>
                    )}
                    <span className="hidden sm:block text-sm font-medium max-w-[100px] truncate">
                        {displayName}
                    </span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-2">
                <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{displayName}</p>
                        <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/portfolio')} className="cursor-pointer">
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    <span>Portfolio</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => openDepositModal()}
                    className="group relative cursor-pointer bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white focus:text-white my-1 py-3 shadow-md hover:shadow-lg hover:shadow-green-500/20 transition-all duration-300 border border-green-500/20 overflow-hidden"
                >
                    <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                    <div className="flex items-center justify-between w-full relative z-10">
                        <div className="flex items-center gap-2.5">
                            <div className="p-1 rounded-full bg-white/20 group-hover:bg-white/30 transition-colors">
                                <Wallet className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-rotate-12 group-hover:scale-110" />
                            </div>
                            <span className="font-bold tracking-wide text-sm">Deposit</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-black/20 group-hover:bg-black/30 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border border-white/10">
                            <span className="text-white/95 tracking-wide">{balance?.availableBalance ? Number(balance.availableBalance).toFixed(2) : '0.00'}</span>
                            <span className="text-white/70 text-[10px]">USDC</span>
                        </div>
                    </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/settings')} className="cursor-pointer">
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="cursor-pointer text-red-500 focus:text-red-500 focus:bg-red-500/10">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
