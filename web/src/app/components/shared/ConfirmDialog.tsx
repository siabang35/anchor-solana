import { useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info';
    isLoading?: boolean;
}

export function ConfirmDialog({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'danger',
    isLoading = false
}: ConfirmDialogProps) {
    const cancelRef = useRef<HTMLButtonElement>(null);

    const variantStyles = {
        danger: {
            icon: <AlertTriangle className="text-red-500" size={24} />,
            button: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500',
            border: 'border-red-500/20',
            bg: 'bg-red-500/10'
        },
        warning: {
            icon: <AlertTriangle className="text-orange-500" size={24} />,
            button: 'bg-orange-600 hover:bg-orange-700 text-white focus:ring-orange-500',
            border: 'border-orange-500/20',
            bg: 'bg-orange-500/10'
        },
        info: {
            icon: <AlertTriangle className="text-blue-500" size={24} />,
            button: 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500',
            border: 'border-blue-500/20',
            bg: 'bg-blue-500/10'
        }
    };

    const style = variantStyles[variant];

    return (
        <AnimatePresence>
            {isOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0"
                    aria-labelledby="modal-title"
                    aria-describedby="modal-description"
                    role="dialog"
                    aria-modal="true"
                >
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm"
                        aria-hidden="true"
                    />

                    {/* Modal Panel */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: "spring", duration: 0.3 }}
                        className="relative w-full max-w-md bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden z-10"
                    >
                        <div className="absolute top-4 right-4 z-10">
                            <button
                                onClick={onClose}
                                className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                                aria-label="Close dialog"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6">
                            <div className="flex items-start gap-4">
                                <div className={`p-3 rounded-full shrink-0 ${style.bg} ${style.border} border`}>
                                    {style.icon}
                                </div>
                                <div>
                                    <h3 id="modal-title" className="text-lg font-bold text-white">
                                        {title}
                                    </h3>
                                    <div className="mt-2">
                                        <p id="modal-description" className="text-sm text-neutral-400 leading-relaxed">
                                            {description}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-neutral-900/50 px-6 py-4 flex flex-col sm:flex-row sm:justify-end gap-3 border-t border-neutral-800">
                            <button
                                type="button"
                                ref={cancelRef}
                                onClick={onClose}
                                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-neutral-700 bg-neutral-800 text-white text-sm font-medium hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-500 focus:ring-offset-neutral-900 transition-colors"
                            >
                                {cancelText}
                            </button>
                            <button
                                type="button"
                                onClick={onConfirm}
                                disabled={isLoading}
                                className={`w-full sm:w-auto px-4 py-2 rounded-lg border border-transparent text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-neutral-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all ${style.button}`}
                            >
                                {isLoading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Processing...
                                    </span>
                                ) : (
                                    confirmText
                                )}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
