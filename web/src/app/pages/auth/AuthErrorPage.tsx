import { useNavigate, useSearchParams } from 'react-router-dom';

/**
 * AuthErrorPage - Displays OAuth error messages
 */
export function AuthErrorPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const errorMessage = searchParams.get('message') || 'An unknown error occurred';

    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="text-center max-w-md mx-auto px-6">
                {/* Error Icon */}
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center ring-1 ring-red-500/30">
                    <svg
                        className="w-10 h-10 text-red-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                    </svg>
                </div>

                <h1 className="text-2xl font-bold text-foreground mb-3">
                    Authentication Error
                </h1>

                <p className="text-muted-foreground mb-8 leading-relaxed">
                    {errorMessage}
                </p>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                        onClick={() => navigate('/', { replace: true })}
                        className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                    >
                        Return Home
                    </button>
                    <button
                        onClick={() => window.location.href = '/api/v1/auth/google'}
                        className="px-6 py-3 bg-accent text-foreground rounded-xl font-medium hover:bg-accent/80 transition-all"
                    >
                        Try Again
                    </button>
                </div>

                {/* Help link */}
                <p className="text-sm text-muted-foreground mt-8">
                    Having trouble?{' '}
                    <a href="mailto:support@exoduze.app" className="text-primary hover:underline">
                        Contact Support
                    </a>
                </p>
            </div>
        </div>
    );
}

export default AuthErrorPage;
