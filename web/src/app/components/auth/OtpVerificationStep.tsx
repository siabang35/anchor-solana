import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Loader2, CheckCircle2, AlertCircle, Mail, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { OtpInput } from './OtpInput';
import { cn } from '../ui/utils';
import { otpAuthApi } from '../../../services/api';
import { useAuth } from './AuthContext';

interface OtpVerificationStepProps {
    email: string;
    type: 'signup' | 'login';
    onSuccess: () => void;
    onBack: () => void;
}

type OtpState = 'input' | 'verifying' | 'success' | 'error';

export function OtpVerificationStep({
    email,
    type,
    onSuccess,
    onBack,
}: OtpVerificationStepProps) {
    // Get refreshUser from AuthContext to update global auth state
    const { refreshUser } = useAuth();

    const [otp, setOtp] = useState('');
    const [state, setState] = useState<OtpState>('input');
    const [error, setError] = useState<string | null>(null);
    const [countdown, setCountdown] = useState(60);
    const [canResend, setCanResend] = useState(false);
    const [resending, setResending] = useState(false);

    // Countdown timer for resend
    useEffect(() => {
        if (countdown > 0) {
            const timer = setInterval(() => {
                setCountdown(prev => {
                    if (prev <= 1) {
                        setCanResend(true);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [countdown]);

    // Auto-submit when 6 digits entered
    useEffect(() => {
        if (otp.length === 6 && state === 'input') {
            handleVerify();
        }
    }, [otp]);

    const handleVerify = useCallback(async () => {
        if (otp.length !== 6) return;

        setState('verifying');
        setError(null);

        try {
            // Verify OTP (this sets tokens internally via api.ts)
            await otpAuthApi.verifyOtp(email, otp, type);

            // CRITICAL: Refresh auth state immediately after successful verification
            // This updates the global AuthContext with the new user data
            // Without this, the page would require a manual refresh
            await refreshUser();

            setState('success');
            // Short delay to show success animation, then call parent callback
            setTimeout(onSuccess, 800);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Invalid verification code';
            setError(message);
            setState('error');
            setOtp('');
        }
    }, [otp, email, type, onSuccess, refreshUser]);

    const handleResend = useCallback(async () => {
        if (!canResend || resending) return;

        setResending(true);
        setError(null);

        try {
            await otpAuthApi.resendOtp(email, type);
            setCountdown(60);
            setCanResend(false);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to resend code';
            setError(message);
        } finally {
            setResending(false);
        }
    }, [email, type, canResend, resending]);

    // Success state
    if (state === 'success') {
        return (
            <div className="flex flex-col items-center justify-center py-12 animate-in fade-in zoom-in duration-300">
                <div className="w-20 h-20 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mb-6">
                    <CheckCircle2 className="w-10 h-10" />
                </div>
                <h3 className="text-xl font-bold mb-2">
                    {type === 'signup' ? 'Account Created!' : 'Welcome Back!'}
                </h3>
                <p className="text-muted-foreground text-sm">
                    Redirecting you now...
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col animate-in slide-in-from-right-4 duration-300">
            {/* Header */}
            <div className="flex items-center gap-2 mb-6">
                <button
                    type="button"
                    onClick={onBack}
                    className="p-1 -ml-2 rounded-full hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <span className="font-semibold text-foreground dark:text-white">Verify Email</span>
            </div>
            {/* Email indicator */}
            <div className="flex items-center justify-center gap-2 mb-6 p-3 rounded-lg bg-accent/30">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground dark:text-white">{email}</span>
            </div>

            {/* Instructions */}
            <div className="text-center mb-6">
                <h3 className="text-lg font-semibold mb-2 text-foreground dark:text-white">Check your email</h3>
                <p className="text-sm text-muted-foreground">
                    We sent a 6-digit verification code to your email.
                    <br />Enter it below to continue.
                </p>
            </div>

            {/* Error display */}
            {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-500 text-sm mb-4 animate-in fade-in duration-200">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* OTP Input */}
            <div className="mb-6">
                <OtpInput
                    value={otp}
                    onChange={setOtp}
                    disabled={state === 'verifying'}
                    autoFocus
                />
            </div>

            {/* Verify Button */}
            <Button
                onClick={handleVerify}
                disabled={otp.length !== 6 || state === 'verifying'}
                className={cn(
                    "w-full h-12 rounded-xl text-sm font-medium bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-500/20 transition-all",
                    state === 'verifying' && "opacity-80"
                )}
            >
                {state === 'verifying' ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Verifying...
                    </>
                ) : state === 'error' ? (
                    'Try Again'
                ) : (
                    'Verify Code'
                )}
            </Button>

            {/* Resend section */}
            <div className="flex flex-col items-center mt-6 space-y-2">
                {canResend ? (
                    <button
                        onClick={handleResend}
                        disabled={resending}
                        className="flex items-center gap-2 text-sm text-primary hover:underline font-medium transition-colors"
                    >
                        {resending ? (
                            <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Sending...
                            </>
                        ) : (
                            <>
                                <RefreshCw className="w-3 h-3" />
                                Resend code
                            </>
                        )}
                    </button>
                ) : (
                    <p className="text-xs text-muted-foreground">
                        Resend code in <span className="font-mono font-medium text-foreground">{countdown}s</span>
                    </p>
                )}

                <p className="text-xs text-muted-foreground/60 text-center">
                    Didn't receive the email? Check your spam folder.
                </p>
            </div>
        </div>
    );
}
