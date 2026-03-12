import { useNavigate } from "react-router-dom";
import React from "react";
import {
    X,
    Instagram,
    Facebook,
    Trophy,
    History,
    Gift,
    BarChart2,
    LogOut,
    LogIn,
    UserPlus,
    Shield
} from "lucide-react";
import { Button } from "./ui/button";
import { useAuth } from "./auth/AuthContext";
import { useAdmin } from "../contexts/AdminContext";

interface MobileMenuProps {
    isOpen: boolean;
    onClose: () => void;
    onOpenAuth: (mode?: 'login' | 'signup') => void;
}

export function MobileMenu({ isOpen, onClose, onOpenAuth }: MobileMenuProps) {
    const navigate = useNavigate();
    const { user, isAuthenticated, logout } = useAuth();
    const { isAdmin } = useAdmin();

    return (
        <>
            {/* Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-50 lg:hidden backdrop-blur-sm"
                    onClick={onClose}
                />
            )}

            {/* Sidebar Drawer */}
            <div className={`fixed top-0 left-0 h-full w-[280px] bg-background/95 backdrop-blur-xl border-r border-border z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${isOpen ? "translate-x-0" : "-translate-x-full"
                }`}>

                {/* Header: Socials & Logo */}
                <div className="p-4 flex flex-col gap-4 border-b border-border/40">
                    <div className="flex items-center justify-between">
                        {/* Social Icons - Top Left */}
                        <div className="flex items-center gap-3">
                            <SocialLink icon={
                                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                </svg>
                            } />
                            <SocialLink icon={<Instagram className="w-5 h-5" />} />
                            <SocialLink icon={<Facebook className="w-5 h-5" />} />
                        </div>

                        {/* Close Button */}
                        <button onClick={onClose} className="p-2 hover:bg-accent rounded-full transition-colors">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Content: Navigation */}
                <div className="flex-1 overflow-y-auto py-6 px-4 space-y-2">
                    <MenuItem
                        icon={<BarChart2 className="w-5 h-5 text-blue-500" />}
                        label="Markets"
                        onClick={() => { navigate('/'); onClose(); }}
                    />
                    <MenuItem
                        icon={<Trophy className="w-5 h-5 text-yellow-500" />}
                        label="Ranks"
                        onClick={() => { navigate('/ranks'); onClose(); }}
                    />
                    <MenuItem
                        icon={<History className="w-5 h-5 text-cyan-500" />}
                        label="Activity"
                        onClick={() => { navigate('/activity'); onClose(); }}
                    />
                    <MenuItem
                        icon={<Gift className="w-5 h-5 text-pink-500" />}
                        label="Rewards"
                        onClick={() => { navigate('/rewards'); onClose(); }}
                    />

                    {isAdmin && (
                        <MenuItem
                            icon={<Shield className="w-5 h-5 text-purple-500" />}
                            label="Admin Panel"
                            onClick={() => { navigate('/admin'); onClose(); }}
                        />
                    )}

                    {/* Spacer & Auth Section */}
                    <div className="pt-6 mt-8 border-t border-border/40">
                        {isAuthenticated ? (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 px-2">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold">
                                        {user?.fullName?.[0] || 'U'}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-medium truncate max-w-[150px]">{user?.fullName || 'User'}</span>
                                        <span className="text-xs text-muted-foreground truncate max-w-[150px]">{user?.email}</span>
                                    </div>
                                </div>
                                <Button
                                    variant="destructive"
                                    className="w-full gap-2"
                                    onClick={() => { logout(); onClose(); }}
                                >
                                    <LogOut className="w-4 h-4" />
                                    Log Out
                                </Button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-3 w-full">
                                <Button
                                    variant="outline"
                                    className="w-full justify-center gap-2 h-11 border-border/50 hover:bg-accent hover:text-accent-foreground transition-colors"
                                    onClick={() => { onOpenAuth('login'); onClose(); }}
                                >
                                    <LogIn className="w-4 h-4" />
                                    Log In
                                </Button>
                                <Button
                                    className="w-full justify-center gap-2 h-11 bg-yellow-400 text-black hover:bg-yellow-500 transition-colors shadow-lg shadow-yellow-400/20 font-medium"
                                    onClick={() => { onOpenAuth('signup'); onClose(); }}
                                >
                                    <UserPlus className="w-4 h-4" />
                                    Sign Up
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

function SocialLink({ icon }: { icon: React.ReactNode }) {
    return (
        <a href="#" className="p-2 rounded-full bg-accent/50 hover:bg-accent hover:scale-110 transition-all text-muted-foreground hover:text-foreground">
            {icon}
        </a>
    )
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-accent/50 transition-colors group"
        >
            <div className="p-2 rounded-lg bg-accent/50 group-hover:bg-accent transition-colors">
                {icon}
            </div>
            <span className="font-medium text-lg">{label}</span>
        </button>
    )
}
