import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { setAccessToken, otpAuthApi } from '../../../services/api';
import { useAuth } from '../../components/auth/AuthContext';

/**
 * AuthCallbackPage - Handles OAuth/MagicLink callback from backend
 * 
 * Supports both Implicit Flow (Hash fragments) and PKCE/Query params.
 * Displays explicit success state and redirects to Login.
 */
export function AuthCallbackPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { refreshUser } = useAuth();

    const [status, setStatus] = useState<'loading' | 'success' | 'resending' | 'error'>('loading');
    const [message, setMessage] = useState<string>('');
    const [email, setEmail] = useState<string | null>(null);

    useEffect(() => {
        const processCallback = async () => {
            try {
                // 1. Extract tokens and email from URL
                let accessToken = searchParams.get('access_token');
                let expiresIn = searchParams.get('expires_in');
                let errorDesc = searchParams.get('error_description');
                let emailParam = searchParams.get('email');

                // Check Hash if not in Query (Supabase default for Magic Links)
                if (!accessToken && window.location.hash) {
                    const hashParams = new URLSearchParams(window.location.hash.substring(1));
                    accessToken = hashParams.get('access_token');
                    expiresIn = hashParams.get('expires_in');
                    errorDesc = hashParams.get('error_description');
                    if (!emailParam) emailParam = hashParams.get('email');
                }

                if (emailParam) setEmail(decodeURIComponent(emailParam));

                // 2. Handle Errors
                if (errorDesc) {
                    const decodedError = decodeURIComponent(errorDesc).replace(/\+/g, ' ');
                    setStatus('error');

                    if (decodedError.includes('expired') || decodedError.includes('invalid') || decodedError.includes('not found')) {
                        setMessage('The verification link has expired. Request a new one below.');
                    } else {
                        setMessage(decodedError);
                    }
                    return;
                }

                // 3. Validate Tokens
                if (!accessToken || !expiresIn) {
                    if (searchParams.get('code')) {
                        // PKCE flow not fully handled here yet, assume different page or silent
                    }
                    setStatus('error');
                    setMessage('Invalid verification link. The link may have expired.');
                    return;
                }

                // 4. Store Session
                const expiresInSeconds = parseInt(expiresIn, 10);
                setAccessToken(accessToken, expiresInSeconds);

                // 5. Clean URL
                window.history.replaceState({}, '', '/auth/callback');

                // 6. Refresh User Context
                await refreshUser();

                // 7. Success State
                setStatus('success');

                // 8. Auto-Redirect to Home (Auto-Login)
                setTimeout(() => {
                    navigate('/', { replace: true });
                }, 1500);

            } catch (err) {
                console.error('[AuthCallback] Error:', err);
                setStatus('error');
                setMessage('Failed to complete authentication. Please try logging in.');
            }
        };

        processCallback();
    }, [searchParams, refreshUser, navigate]);

    const handleResend = async () => {
        if (!email) return;

        try {
            setStatus('resending');
            // We use 'signup' type for verification links
            await otpAuthApi.resendOtp(email, 'signup');
            setMessage('A new verification link has been sent to your email.');
            // Keeping status as error/resending to show message, or switch to a 'sent' state?
            // Let's just update message and go back to error state with success message
            // or better, a 'sent' UI. For simplicity, let's just alert or change text.
            setStatus('error'); // Keep error view but update message
        } catch (err: any) {
            console.error('Resend failed:', err);
            setStatus('error');
            setMessage(err.message || 'Failed to resend verification link.');
        } finally {
            // If success, maybe show a different state? 
            // Ideally we stay on error page but change text to "Sent!"
            // But 'resending' spinner is good.
            if (status === 'resending') setStatus('error');
        }
    };

    // ERROR STATE
    if (status === 'error' || status === 'resending') {
        const isResending = status === 'resending';
        const isExpired = message.toLowerCase().includes('expired') || message.toLowerCase().includes('invalid');
        const showResend = isExpired && email;

        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center max-w-md mx-auto px-6">
                    <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/10 flex items-center justify-center">
                        <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-foreground mb-2">Verification Failed</h2>
                    <p className="text-muted-foreground mb-6">{message}</p>

                    <div className="flex flex-col gap-3">
                        {showResend && (
                            <button
                                onClick={handleResend}
                                disabled={isResending}
                                className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center"
                            >
                                {isResending ? (
                                    <>
                                        <div className="w-4 h-4 mr-2 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                        Sending...
                                    </>
                                ) : (
                                    'Resend Verification Link'
                                )}
                            </button>
                        )}

                        <button
                            onClick={() => navigate('/auth/login', { replace: true })}
                            className={`px-6 py-3 rounded-lg font-medium transition-colors ${showResend
                                ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                                : 'bg-primary text-primary-foreground hover:bg-primary/90'
                                }`}
                        >
                            Return to Login
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // SUCCESS STATE
    if (status === 'success') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center max-w-md mx-auto px-6">
                    <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-green-500/10 flex items-center justify-center">
                        <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-foreground mb-2">Verified Successfully!</h2>
                    <p className="text-muted-foreground mb-6">
                        Redirecting you to login...
                    </p>
                    {/* Progress Bar */}
                    <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-primary animate-[progress_1.5s_ease-in-out]" />
                    </div>
                </div>
            </div>
        );
    }

    // LOADING STATE
    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-6 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                <h2 className="text-xl font-semibold text-foreground mt-4">Verifying...</h2>
            </div>
        </div>
    );
}

export default AuthCallbackPage;
