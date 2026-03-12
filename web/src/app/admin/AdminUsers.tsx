import { useEffect, useState } from 'react';
import { adminApi, AdminUser } from '../../services/adminApi';
import {
    MoreHorizontal,
    Search,
    Shield,
    CheckCircle,
    Ban,
    AlertCircle,
    RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from '../components/shared/ToastProvider';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { ResponsiveTable } from '../components/shared/ResponsiveTable';
import { SkeletonTable } from '../components/shared/SkeletonLoader';
import { sanitizeText } from '../../utils/security';

export function AdminUsers() {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
    const [page, setPage] = useState(1);
    const [confirmAction, setConfirmAction] = useState<{
        type: 'suspend' | 'activate';
        user: AdminUser;
        isOpen: boolean;
    } | null>(null);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(sanitizeText(searchQuery));
            setPage(1); // Reset to page 1 on search
        }, 500);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const result = await adminApi.getUsers(debouncedSearch, page);
            // Ensure we handle the response structure correctly (data vs direct array)
            // adminApi.getUsers returns { data: [], total: number } based on refactor
            setUsers(result.data || []);
        } catch (error) {
            console.error('Failed to fetch users', error);
            toast.error('Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, [debouncedSearch, page]);

    const handleUserStatusChange = async () => {
        if (!confirmAction) return;

        const { type, user } = confirmAction;
        const newStatus = type === 'suspend' ? 'suspended' : 'active';

        try {
            await adminApi.updateUserStatus(user.id, newStatus, `Manual action by admin via UI`);
            toast.success(`User ${user.fullName} ${newStatus === 'active' ? 'activated' : 'suspended'} successfully`);

            // Update local state
            setUsers(users.map(u => u.id === user.id ? { ...u, status: newStatus } : u));
            if (selectedUser?.id === user.id) {
                setSelectedUser({ ...selectedUser, status: newStatus });
            }
        } catch (error) {
            console.error('Failed to update user status', error);
            toast.error('Failed to update user status');
        } finally {
            setConfirmAction(null);
        }
    };

    const columns = [
        {
            key: 'user',
            header: 'User',
            render: (user: AdminUser) => (
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-neutral-800 to-neutral-700 flex items-center justify-center font-bold text-xs ring-1 ring-neutral-700">
                        {user.fullName.charAt(0)}
                    </div>
                    <div>
                        <div className="font-medium text-white">{user.fullName}</div>
                        <div className="text-xs text-neutral-500">{user.email}</div>
                    </div>
                </div>
            )
        },
        {
            key: 'status',
            header: 'Status',
            render: (user: AdminUser) => <StatusBadge status={user.status} />
        },
        {
            key: 'balance',
            header: 'Balance',
            align: 'right' as const,
            sortable: true,
            render: (user: AdminUser) => (
                <span className="font-mono text-neutral-300">
                    ${user.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
            )
        },
        {
            key: 'riskScore',
            header: 'Risk Score',
            align: 'center' as const,
            sortable: true,
            render: (user: AdminUser) => <RiskBadge score={user.riskScore} />
        },
        {
            key: 'createdAt',
            header: 'Joined',
            render: (user: AdminUser) => (
                <span className="text-neutral-400 text-xs">
                    {new Date(user.createdAt).toLocaleDateString()}
                </span>
            )
        }
    ];

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header & Controls */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
                    <p className="text-neutral-400">View, manage, and monitor user accounts.</p>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:flex-none">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
                        <input
                            type="text"
                            placeholder="Search users..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-neutral-900 border border-neutral-800 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 w-full sm:w-64 transition-all"
                        />
                    </div>
                    <button
                        onClick={fetchUsers}
                        className="p-2 border border-neutral-800 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                        title="Reload"
                    >
                        <RefreshCw size={18} />
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="bg-neutral-950 border border-neutral-800 rounded-2xl overflow-hidden min-h-[400px]">
                {loading ? (
                    <div className="p-6">
                        <SkeletonTable rows={8} />
                    </div>
                ) : (
                    <ResponsiveTable
                        data={users}
                        columns={columns}
                        keyField="id"
                        onRowClick={(user) => setSelectedUser(user)}
                        emptyMessage={`No users found matching "${searchQuery}"`}
                        actions={(user) => (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedUser(user);
                                }}
                                className="text-neutral-500 hover:text-white p-1 rounded hover:bg-neutral-800 transition-colors"
                            >
                                <MoreHorizontal size={16} />
                            </button>
                        )}
                    />
                )}

                {/* Simple Pagination Controls (can be extracted to separate component) */}
                {!loading && users.length > 0 && (
                    <div className="px-6 py-4 border-t border-neutral-800 flex justify-between items-center">
                        <button
                            disabled={page === 1}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            className="text-sm text-neutral-400 hover:text-white disabled:opacity-50"
                        >
                            Previous
                        </button>
                        <span className="text-sm text-neutral-500">Page {page}</span>
                        <button
                            disabled={users.length < 10} // Assuming limit is 10
                            onClick={() => setPage(p => p + 1)}
                            className="text-sm text-neutral-400 hover:text-white disabled:opacity-50"
                        >
                            Next
                        </button>
                    </div>
                )}
            </div>

            {/* Confirm Dialog */}
            <ConfirmDialog
                isOpen={!!confirmAction?.isOpen}
                onClose={() => setConfirmAction(null)}
                onConfirm={handleUserStatusChange}
                title={confirmAction?.type === 'suspend' ? 'Suspend User?' : 'Activate User?'}
                description={confirmAction?.type === 'suspend'
                    ? `Are you sure you want to suspend ${confirmAction?.user.fullName}? They will no longer be able to log in or trade.`
                    : `Are you sure you want to activate ${confirmAction?.user.fullName}?`
                }
                variant={confirmAction?.type === 'suspend' ? 'danger' : 'info'}
                confirmText={confirmAction?.type === 'suspend' ? 'Suspend Account' : 'Activate Account'}
            />

            {/* User Detail Drawer */}
            <AnimatePresence>
                {selectedUser && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedUser(null)}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                        />
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: "spring", damping: 30, stiffness: 300 }}
                            className="fixed inset-y-0 right-0 w-full max-w-md bg-neutral-950 border-l border-neutral-800 z-50 overflow-y-auto p-6 shadow-2xl"
                            role="dialog"
                            aria-modal="true"
                            aria-label="User Details"
                        >
                            <div className="mb-8">
                                <button
                                    onClick={() => setSelectedUser(null)}
                                    className="mb-4 text-sm text-neutral-400 hover:text-white flex items-center gap-1"
                                >
                                    Close
                                </button>
                                <div className="flex items-center justify-between">
                                    <h2 className="text-2xl font-bold">{selectedUser.fullName}</h2>
                                    <StatusBadge status={selectedUser.status} />
                                </div>
                                <p className="text-neutral-500">{selectedUser.email}</p>
                                <p className="text-xs font-mono text-neutral-600 mt-1">ID: {selectedUser.id}</p>
                            </div>

                            <div className="space-y-6">

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
                                        <p className="text-xs text-neutral-500 mb-1">Total Balance</p>
                                        <p className="text-xl font-mono font-bold">${selectedUser.balance.toLocaleString()}</p>
                                    </div>
                                    <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
                                        <p className="text-xs text-neutral-500 mb-1">Locked Amount</p>
                                        <p className="text-xl font-mono font-bold">${selectedUser.lockedBalance.toLocaleString()}</p>
                                    </div>
                                    <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
                                        <p className="text-xs text-neutral-500 mb-1">Deposits</p>
                                        <p className="text-xl font-mono font-bold">${selectedUser.totalDeposits?.toLocaleString() ?? 0}</p>
                                    </div>
                                    <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
                                        <p className="text-xs text-neutral-500 mb-1">Withdrawals</p>
                                        <p className="text-xl font-mono font-bold">${selectedUser.totalWithdrawals?.toLocaleString() ?? 0}</p>
                                    </div>
                                </div>

                                <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="font-semibold text-sm">Risk Assessment</h3>
                                        <RiskBadge score={selectedUser.riskScore} />
                                    </div>
                                    <div className="h-2 bg-neutral-800 rounded-full overflow-hidden mt-2">
                                        <div
                                            className={`h-full ${selectedUser.riskScore > 75 ? 'bg-red-500' :
                                                selectedUser.riskScore > 30 ? 'bg-orange-500' : 'bg-green-500'
                                                }`}
                                            style={{ width: `${selectedUser.riskScore}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-neutral-500 mt-2">
                                        Based on login patterns, withdrawal velocity, and device fingerprints.
                                    </p>
                                </div>

                                <div>
                                    <h3 className="font-semibold text-sm mb-3">Login History</h3>
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between text-xs py-2 border-b border-neutral-800">
                                            <span className="text-white">Most Recent</span>
                                            <span className="text-neutral-500">{new Date(selectedUser.lastLoginAt).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-4 space-y-3">
                                    <button className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg font-medium transition-colors">
                                        Reset Password / 2FA
                                    </button>
                                    {selectedUser.status === 'active' ? (
                                        <button
                                            onClick={() => setConfirmAction({ type: 'suspend', user: selectedUser, isOpen: true })}
                                            className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/50 rounded-lg font-medium transition-colors"
                                        >
                                            Suspend Account
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => setConfirmAction({ type: 'activate', user: selectedUser, isOpen: true })}
                                            className="w-full py-2 bg-green-500/10 hover:bg-green-500/20 text-green-500 border border-green-500/50 rounded-lg font-medium transition-colors"
                                        >
                                            Reactivate Account
                                        </button>
                                    )}
                                </div>

                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    if (status === 'active') {
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/20"><CheckCircle size={12} /> Active</span>;
    }
    return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/20"><Ban size={12} /> Suspended</span>;
}

function RiskBadge({ score }: { score: number }) {
    if (score < 30) {
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/20"><Shield size={12} /> Low Risk ({score})</span>;
    }
    if (score < 75) {
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-500/10 text-orange-500 border border-orange-500/20"><AlertCircle size={12} /> Medium ({score})</span>;
    }
    return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/20"><Shield size={12} /> High Risk ({score})</span>;
}
