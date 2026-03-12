import { Toaster } from 'sonner';

export function ToastProvider() {
    return (
        <Toaster
            theme="dark"
            position="top-right"
            toastOptions={{
                classNames: {
                    toast: 'bg-neutral-900 border border-neutral-800 text-white shadow-lg',
                    description: 'text-neutral-400',
                    actionButton: 'bg-blue-600',
                    cancelButton: 'bg-neutral-800',
                }
            }}
        />
    );
}

// Re-export toast for ease of import
export { toast } from 'sonner';
