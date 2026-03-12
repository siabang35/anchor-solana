import React, { useState } from 'react';
import { Button } from '../ui/button';
import { ArrowLeft, Loader2, Eye, EyeOff, AlertCircle, Mail, ShieldCheck, MailCheck } from 'lucide-react';
import { cn } from '../ui/utils';
import { otpAuthApi } from '../../../services/api';
import { OtpVerificationStep } from './OtpVerificationStep';

interface EmailFormProps {
    initialMode?: FormMode;
    onBack: () => void;
    onSuccess: () => void;
}

type FormMode = 'login' | 'signup';
type FormStep = 'credentials' | 'otp' | 'check-email';

export function EmailForm({ initialMode = 'login', onBack, onSuccess }: EmailFormProps) {
    const [mode, setMode] = useState<FormMode>(initialMode);
    const [step, setStep] = useState<FormStep>('credentials');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [termsAccepted, setTermsAccepted] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) return;

        setLoading(true);
        setError(null);

        try {
            if (mode === 'login') {
                // Login: Request OTP
                await otpAuthApi.requestLoginOtp(email, password);
                setStep('otp');
            } else {
                // Signup: Create account & send verification email link
                await otpAuthApi.requestSignupOtp(email, password, fullName || undefined);
                setStep('check-email');
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'An error occurred';
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const toggleMode = () => {
        setMode(mode === 'login' ? 'signup' : 'login');
        setError(null);
        setStep('credentials');
    };

    const handleOtpBack = () => {
        setStep('credentials');
        setError(null);
    };

    // OTP Verification Step (Login only)
    if (step === 'otp') {
        return (
            <OtpVerificationStep
                email={email}
                type="login"
                onSuccess={onSuccess}
                onBack={handleOtpBack}
            />
        );
    }

    // Check Email Step (Signup - verification link sent)
    if (step === 'check-email') {
        return (
            <div className="flex flex-col animate-in slide-in-from-right-4 duration-300">
                {/* Header */}
                <div className="flex items-center gap-2 mb-6">
                    <button
                        type="button"
                        onClick={handleOtpBack}
                        className="p-1 -ml-2 rounded-full hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <span className="font-semibold text-foreground dark:text-white">Check Your Email</span>
                </div>

                {/* Success Icon */}
                <div className="flex flex-col items-center justify-center py-8">
                    <div className="w-20 h-20 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mb-6 animate-in zoom-in duration-300">
                        <MailCheck className="w-10 h-10" />
                    </div>

                    <h3 className="text-xl font-bold mb-2 text-center text-foreground dark:text-white">Account Created!</h3>

                    <p className="text-sm text-muted-foreground text-center mb-6 max-w-xs">
                        We sent a verification link to <span className="font-medium text-foreground">{email}</span>.
                        Click the link to activate your account.
                    </p>

                    {/* Email indicator */}
                    <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-accent/30 mb-6 w-full">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{email}</span>
                    </div>

                    {/* Tips */}
                    <div className="text-xs text-muted-foreground/60 text-center space-y-1">
                        <p>Didn't receive the email? Check your spam folder.</p>
                        <button
                            onClick={async () => {
                                try {
                                    setLoading(true);
                                    await otpAuthApi.resendOtp(email, 'signup');
                                    setError(null);
                                } catch (err) {
                                    setError(err instanceof Error ? err.message : 'Failed to resend');
                                } finally {
                                    setLoading(false);
                                }
                            }}
                            disabled={loading}
                            className="text-primary hover:underline font-medium"
                        >
                            {loading ? 'Sending...' : 'Resend verification email'}
                        </button>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-500 text-sm mt-4 w-full">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Already verified button */}
                    <Button
                        onClick={() => {
                            setMode('login');
                            setStep('credentials');
                            setPassword('');
                        }}
                        variant="ghost"
                        className="mt-6 text-sm"
                    >
                        Already verified? Log in
                    </Button>
                </div>
            </div>
        );
    }

    // Credentials Step
    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 animate-in slide-in-from-right-4 duration-300">
            {/* Header */}
            <div className="flex items-center gap-2 mb-2">
                <button
                    type="button"
                    onClick={onBack}
                    className="p-1 -ml-2 rounded-full hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <span className="font-semibold text-foreground dark:text-white">
                    {mode === 'login' ? 'Log In' : 'Create Account'}
                </span>
            </div>

            {/* Security Badge */}
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-gradient-to-r from-blue-500/5 to-indigo-500/5 border border-blue-500/10">
                <div className="p-1.5 rounded-md bg-blue-500/10">
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                </div>
                <span className="text-xs text-muted-foreground">
                    {mode === 'login'
                        ? 'Secured with email verification code'
                        : 'Email verification required for security'
                    }
                </span>
            </div>

            {/* Error Display */}
            {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-500 text-sm animate-in fade-in duration-200">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            <div className="space-y-4">
                {/* Full Name (Signup only) */}
                {mode === 'signup' && (
                    <div className="group">
                        <label className="text-xs font-medium text-muted-foreground ml-1 mb-1.5 block">Full Name</label>
                        <input
                            type="text"
                            placeholder="John Doe"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-accent/20 border border-border/50 focus:border-primary/50 focus:bg-accent/30 focus:ring-4 focus:ring-primary/10 outline-none transition-all placeholder:text-muted-foreground/50 text-sm text-foreground dark:text-white"
                        />
                    </div>
                )}

                {/* Email */}
                <div className="group">
                    <label className="text-xs font-medium text-muted-foreground ml-1 mb-1.5 block">Email address</label>
                    <div className="relative">
                        <input
                            type="email"
                            required
                            placeholder="name@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-3 pl-11 rounded-xl bg-accent/20 border border-border/50 focus:border-primary/50 focus:bg-accent/30 focus:ring-4 focus:ring-primary/10 outline-none transition-all placeholder:text-muted-foreground/50 text-sm text-foreground dark:text-white"
                            autoFocus
                        />
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                    </div>
                </div>

                {/* Password */}
                <div className="group">
                    <label className="text-xs font-medium text-muted-foreground ml-1 mb-1.5 block">Password</label>
                    <div className="relative">
                        <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-3 pr-12 rounded-xl bg-accent/20 border border-border/50 focus:border-primary/50 focus:bg-accent/30 focus:ring-4 focus:ring-primary/10 outline-none transition-all placeholder:text-muted-foreground/50 text-sm text-foreground dark:text-white"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                        >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                    {mode === 'signup' && (
                        <p className="text-[10px] text-muted-foreground/60 mt-1.5 ml-1">
                            Min 8 chars, 1 uppercase, 1 lowercase, 1 number
                        </p>
                    )}
                </div>

                {/* Terms Checkbox */}
                <div className="flex items-start gap-2 px-1">
                    <input
                        type="checkbox"
                        id="terms"
                        checked={termsAccepted}
                        onChange={(e) => setTermsAccepted(e.target.checked)}
                        className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="terms" className="text-xs text-muted-foreground leading-snug cursor-pointer select-none">
                        I agree to the <span className="text-primary hover:underline">Terms of Service</span> and <span className="text-primary hover:underline">Privacy Policy</span>.
                    </label>
                </div>

                {/* Submit Button */}
                <Button
                    type="submit"
                    disabled={loading || !email || !password || !termsAccepted}
                    className={cn(
                        "w-full h-12 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-500/20 transition-all",
                        loading && "opacity-80"
                    )}
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    {loading
                        ? (mode === 'login' ? 'Sending code...' : 'Creating account...')
                        : 'Continue'
                    }
                </Button>
            </div>

            {/* Mode Toggle */}
            <p className="text-center text-xs text-muted-foreground mt-2">
                {mode === 'login' ? (
                    <>
                        Don't have an account?{' '}
                        <button type="button" onClick={toggleMode} className="text-primary hover:underline font-medium">
                            Sign up
                        </button>
                    </>
                ) : (
                    <>
                        Already have an account?{' '}
                        <button type="button" onClick={toggleMode} className="text-primary hover:underline font-medium">
                            Log in
                        </button>
                    </>
                )}
            </p>
        </form>
    );
}
