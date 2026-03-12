import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { otpAuthApi, setAccessToken } from '../../../services/api';
import { useAuth } from '../../components/auth/AuthContext';

/**
 * VerifyEmailPage
 * 
 * Handles "Safe Verification" flow.
 * 1. Receives ?token=...&type=...&email=... from the email link.
 * 2. Sends a POST request to verify the token (preventing GET-based scanners from consuming it).
 * 3. On success, sets session and redirects to Home (Auto-Login).
 */
export function VerifyEmailPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { refreshUser } = useAuth();

    const [status, setStatus] = useState<'pending' | 'verifying' | 'success' | 'error'>('pending');
    const [message, setMessage] = useState('');
    const [isResending, setIsResending] = useState(false);

    const token = searchParams.get('token');
    // Support: signup, magiclink, email_change (wallet user adding email)
    const type = (searchParams.get('type') as 'signup' | 'magiclink' | 'email_change') || 'magiclink';
    const email = searchParams.get('email');
    const uid = searchParams.get('uid'); // User ID for email_change verification

    // Anti-Scanner Protection: We DO NOT auto-verify in useEffect.
    // We require a manual click to ensure a human is present and prevent scanners from consuming the token.

    const handleVerify = async () => {
        if (!token || !email) {
            setStatus('error');
            setMessage('Invalid verification link.');
            return;
        }

        setStatus('verifying');

        try {
            // Handle different verification types differently
            if (type === 'email_change') {
                // Email change verification - uses public endpoint, doesn't require prior login
                const { userApi } = await import('../../../services/api');
                await userApi.verifyEmailLink(email, token, uid || undefined);

                // Refresh user data (user should be logged in already from wallet)
                await refreshUser();

                setStatus('success');
                setMessage('Email verified! Redirecting...');
                setTimeout(() => {
                    navigate('/settings', { replace: true });
                }, 1500);
            } else {
                // signup, login, magiclink, recovery - uses OTP API
                const response = await otpAuthApi.verifyOtp(email, token, type as any);

                // Auto-Login
                setAccessToken(response.tokens.accessToken, response.tokens.expiresIn);
                await refreshUser();

                setStatus('success');
                setTimeout(() => {
                    navigate('/', { replace: true });
                }, 1500);
            }
        } catch (error: any) {
            console.error('Verification failed:', error);
            setStatus('error');
            setMessage(error.message || 'Verification failed. Please try again.');
        }
    };

    const handleResend = async () => {
        if (!email) return;
        setIsResending(true);
        try {
            await otpAuthApi.resendOtp(email, 'signup');
            setMessage('A new verification link has been sent to your email. Please check your inbox.');
            // Stay in error state but verify message is updated
        } catch (error: any) {
            setMessage(error.message || 'Failed to resend link.');
        } finally {
            setIsResending(false);
        }
    };

    if (status === 'pending') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center max-w-md mx-auto px-6">
                    <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
                        <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-foreground mb-2">Verify Your Email</h2>
                    <p className="text-muted-foreground mb-6">
                        Click the button below to verify your email address and secure your account.
                    </p>
                    <button
                        onClick={handleVerify}
                        className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-lg font-bold hover:bg-primary/90 transition-all shadow-lg hover:shadow-primary/25"
                    >
                        Verify Email
                    </button>
                    <p className="text-xs text-muted-foreground mt-4">
                        This step protects your account from automated bots.
                    </p>
                </div>
            </div>
        );
    }

    if (status === 'verifying') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-6 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                    <h2 className="text-xl font-semibold text-foreground mt-4">Verifying...</h2>
                    <p className="text-muted-foreground mt-2">Please wait a moment.</p>
                </div>
            </div>
        );
    }

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
                        Logging you in...
                    </p>
                    <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-primary animate-[progress_1.5s_ease-in-out]" />
                    </div>
                </div>
            </div>
        );
    }

    // Error State
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
                    {email && (
                        <button
                            onClick={handleResend}
                            disabled={isResending}
                            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center"
                        >
                            {isResending ? 'Sending...' : 'Resend Verification Link'}
                        </button>
                    )}

                    <button
                        onClick={() => navigate('/?login=true', { replace: true })}
                        className="px-6 py-3 bg-secondary text-secondary-foreground rounded-lg font-medium hover:bg-secondary/80 transition-colors"
                    >
                        Return to Login
                    </button>
                </div>
            </div>
        </div>
    );
}

export default VerifyEmailPage;
