import { ReactNode, useState } from 'react';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import { motion } from 'motion/react';

interface Column<T> {
    key: keyof T | string;
    header: string;
    render?: (item: T) => ReactNode;
    sortable?: boolean;
    align?: 'left' | 'center' | 'right';
    className?: string; // Additional classes for the cell
}

interface ResponsiveTableProps<T> {
    data: T[];
    columns: Column<T>[];
    keyField: keyof T;
    isLoading?: boolean;
    emptyMessage?: string;
    onRowClick?: (item: T) => void;
    actions?: (item: T) => ReactNode; // Render function for row actions
}

export function ResponsiveTable<T>({
    data,
    columns,
    keyField,
    isLoading = false,
    emptyMessage = "No data found",
    onRowClick,
    actions
}: ResponsiveTableProps<T>) {
    const [sortField, setSortField] = useState<keyof T | string | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    const handleSort = (key: keyof T | string) => {
        if (sortField === key) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(key);
            setSortDirection('asc');
        }
    };

    // Sort data
    const sortedData = [...data].sort((a: any, b: any) => {
        if (!sortField) return 0;

        const aVal = a[sortField];
        const bVal = b[sortField];

        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    if (isLoading) {
        // Simple loading state - parent should use SkeletonTable for better UX
        return <div className="p-8 text-center text-neutral-500 animate-pulse">Loading data...</div>;
    }

    if (data.length === 0) {
        return (
            <div className="p-12 text-center border-2 border-dashed border-neutral-800 rounded-xl bg-neutral-900/50">
                <Search className="mx-auto h-12 w-12 text-neutral-500 mb-4 opacity-50" />
                <h3 className="text-lg font-medium text-white mb-1">No data found</h3>
                <p className="text-neutral-500 text-sm">{emptyMessage}</p>
            </div>
        );
    }

    return (
        <div className="w-full">
            {/* Desktop Table View (Hidden on Mobile) */}
            <div className="hidden lg:block bg-neutral-950 border border-neutral-800 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-neutral-900/50 text-neutral-400 border-b border-neutral-800">
                        <tr>
                            {columns.map((col) => (
                                <th
                                    key={String(col.key)}
                                    className={`px-6 py-4 font-medium transition-colors ${col.sortable ? 'cursor-pointer hover:text-white' : ''} text-${col.align || 'left'}`}
                                    onClick={() => col.sortable && handleSort(col.key)}
                                    role={col.sortable ? "button" : undefined}
                                    tabIndex={col.sortable ? 0 : undefined}
                                >
                                    <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : ''}`}>
                                        {col.header}
                                        {sortField === col.key && (
                                            sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                                        )}
                                    </div>
                                </th>
                            ))}
                            {actions && <th className="px-6 py-4 text-right">Actions</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                        {sortedData.map((item) => (
                            <tr
                                key={String(item[keyField])}
                                onClick={() => onRowClick && onRowClick(item)}
                                className={`group hover:bg-neutral-900/50 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                                tabIndex={onRowClick ? 0 : undefined}
                                onKeyDown={(e) => {
                                    if (onRowClick && (e.key === 'Enter' || e.key === ' ')) {
                                        onRowClick(item);
                                    }
                                }}
                            >
                                {columns.map((col) => (
                                    <td
                                        key={`${String(item[keyField])}-${String(col.key)}`}
                                        className={`px-6 py-4 ${col.className || ''} text-${col.align || 'left'}`}
                                    >
                                        {col.render ? col.render(item) : (item as any)[col.key]}
                                    </td>
                                ))}
                                {actions && (
                                    <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                                        {actions(item)}
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile Card View (Hidden on Desktop) */}
            <div className="lg:hidden space-y-4">
                {sortedData.map((item) => (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={String(item[keyField])}
                        onClick={() => onRowClick && onRowClick(item)}
                        className={`bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3 ${onRowClick ? 'active:bg-neutral-900 transition-colors' : ''}`}
                    >
                        {columns.map((col, idx) => (
                            <div key={String(col.key)} className={`flex justify-between items-start gap-4 ${idx === 0 ? 'mb-2' : ''}`}>
                                <span className={`text-xs text-neutral-500 font-medium uppercase tracking-wider ${idx === 0 ? 'hidden' : ''}`}>
                                    {col.header}
                                </span>
                                <div className={`${idx === 0 ? 'text-base font-semibold text-white w-full' : 'text-sm text-neutral-300 text-right flex-1'}`}>
                                    {col.render ? col.render(item) : (item as any)[col.key]}
                                </div>
                            </div>
                        ))}
                        {actions && (
                            <div className="pt-3 mt-2 border-t border-neutral-800 flex justify-end">
                                {actions(item)}
                            </div>
                        )}
                    </motion.div>
                ))}
            </div>
        </div>
    );
}
