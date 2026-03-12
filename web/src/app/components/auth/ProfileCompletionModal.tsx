import { useState, useEffect, useCallback } from 'react';
import { Check, X, Loader2, AlertCircle, User, FileText, Shield } from 'lucide-react';
import { Dialog, DialogContent } from '../ui/dialog';
import { authApi } from '../../../services/api';
import { useAuth } from './AuthContext';

interface ProfileCompletionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onComplete: () => void;
    prefillFullName?: string;
}

/**
 * ProfileCompletionModal - Modern glassmorphic modal for completing profile after Google OAuth
 * 
 * Features:
 * - Real-time username availability check (debounced)
 * - Terms of Service and Privacy Policy acceptance
 * - Mobile-responsive design
 * - Premium animations
 * - OWASP-compliant validation
 */
export function ProfileCompletionModal({
    isOpen,
    onClose,
    onComplete,
    prefillFullName = '',
}: ProfileCompletionModalProps) {
    const { refreshUser } = useAuth();

    // Form state
    const [username, setUsername] = useState('');
    const [fullName, setFullName] = useState(prefillFullName);
    const [agreeToTerms, setAgreeToTerms] = useState(false);
    const [agreeToPrivacy, setAgreeToPrivacy] = useState(false);

    // UI state
    const [isCheckingUsername, setIsCheckingUsername] = useState(false);
    const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
    const [usernameError, setUsernameError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    // Debounced username check
    useEffect(() => {
        if (!username || username.length < 3) {
            setUsernameAvailable(null);
            setUsernameError(username.length > 0 && username.length < 3 ? 'Username must be at least 3 characters' : null);
            return;
        }

        // Validate format
        if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(username)) {
            setUsernameAvailable(false);
            setUsernameError('Username must start with a letter and contain only letters, numbers, and underscores');
            return;
        }

        const checkUsername = async () => {
            setIsCheckingUsername(true);
            setUsernameError(null);
            try {
                const result = await authApi.checkUsernameAvailable(username);
                setUsernameAvailable(result.available);
                setUsernameError(result.available ? null : result.message || 'Username not available');
            } catch (err) {
                setUsernameError('Failed to check username');
                setUsernameAvailable(null);
            } finally {
                setIsCheckingUsername(false);
            }
        };

        const timer = setTimeout(checkUsername, 500);
        return () => clearTimeout(timer);
    }, [username]);

    // Reset form on open
    useEffect(() => {
        if (isOpen) {
            setFullName(prefillFullName);
            setSubmitError(null);
        }
    }, [isOpen, prefillFullName]);

    const handleSubmit = useCallback(async () => {
        if (!usernameAvailable || !agreeToTerms || !agreeToPrivacy || isSubmitting) {
            return;
        }

        setIsSubmitting(true);
        setSubmitError(null);

        try {
            await authApi.completeGoogleProfile({
                username,
                fullName: fullName || undefined,
                agreeToTerms,
                agreeToPrivacy,
            });

            // Refresh user data
            await refreshUser();

            // Notify completion
            onComplete();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to complete profile';
            setSubmitError(message);
        } finally {
            setIsSubmitting(false);
        }
    }, [username, fullName, agreeToTerms, agreeToPrivacy, usernameAvailable, isSubmitting, refreshUser, onComplete]);

    const canSubmit = usernameAvailable && agreeToTerms && agreeToPrivacy && !isSubmitting && !isCheckingUsername;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[480px] p-0 gap-0 overflow-hidden bg-background/80 backdrop-blur-xl border-white/10 shadow-2xl duration-300 [&>button]:hidden ring-1 ring-white/5">
                {/* Close button */}
                <div className="absolute right-4 top-4 z-50">
                    <button
                        onClick={onClose}
                        className="rounded-full p-2 bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 transition-all text-muted-foreground hover:text-foreground cursor-pointer ring-1 ring-inset ring-black/5 dark:ring-white/5"
                        aria-label="Close"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Background effects */}
                <div className="absolute top-0 left-0 w-full h-[180px] bg-gradient-to-b from-green-500/10 via-emerald-500/10 to-transparent pointer-events-none" />
                <div className="absolute -top-[100px] -left-[100px] w-[200px] h-[200px] bg-green-500/20 blur-[100px] rounded-full pointer-events-none" />
                <div className="absolute top-0 right-0 w-[150px] h-[150px] bg-emerald-500/20 blur-[80px] rounded-full pointer-events-none" />

                <div className="p-8 pb-10 relative">
                    {/* Header */}
                    <div className="text-center space-y-1.5 mb-6">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center ring-1 ring-green-500/30">
                            <User className="w-8 h-8 text-green-500" />
                        </div>
                        <h2 className="text-2xl font-bold tracking-tight">
                            Complete Your Profile
                        </h2>
                        <p className="text-muted-foreground text-sm">
                            Choose a unique username to get started
                        </p>
                    </div>

                    {/* Form */}
                    <div className="space-y-5">
                        {/* Username Input */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground flex items-center gap-2">
                                <span>Username</span>
                                <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">@</span>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                                    placeholder="your_username"
                                    maxLength={30}
                                    className={`w-full pl-10 pr-12 py-3 rounded-xl bg-accent/50 border transition-all outline-none ${usernameError
                                            ? 'border-red-500/50 focus:border-red-500'
                                            : usernameAvailable
                                                ? 'border-green-500/50 focus:border-green-500'
                                                : 'border-border/50 focus:border-primary'
                                        }`}
                                />
                                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                    {isCheckingUsername && <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />}
                                    {!isCheckingUsername && usernameAvailable && <Check className="w-5 h-5 text-green-500" />}
                                    {!isCheckingUsername && usernameAvailable === false && <AlertCircle className="w-5 h-5 text-red-500" />}
                                </div>
                            </div>
                            {usernameError && (
                                <p className="text-sm text-red-500 flex items-center gap-1.5">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    {usernameError}
                                </p>
                            )}
                            {usernameAvailable && (
                                <p className="text-sm text-green-500 flex items-center gap-1.5">
                                    <Check className="w-3.5 h-3.5" />
                                    Username is available!
                                </p>
                            )}
                        </div>

                        {/* Full Name Input */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">
                                Full Name <span className="text-muted-foreground">(optional)</span>
                            </label>
                            <input
                                type="text"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                placeholder="John Doe"
                                maxLength={100}
                                className="w-full px-4 py-3 rounded-xl bg-accent/50 border border-border/50 focus:border-primary transition-all outline-none"
                            />
                        </div>

                        {/* Terms Checkboxes */}
                        <div className="space-y-3 pt-2">
                            <label
                                className="flex items-start gap-3 cursor-pointer group"
                                onClick={() => setAgreeToTerms(!agreeToTerms)}
                            >
                                <div className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center transition-all duration-200 ${agreeToTerms
                                        ? 'bg-primary border-primary'
                                        : 'border-muted-foreground/30 bg-accent/10 group-hover:border-primary/50'
                                    }`}>
                                    {agreeToTerms && <Check className="w-3.5 h-3.5 text-primary-foreground stroke-[3px]" />}
                                </div>
                                <span className="text-sm text-muted-foreground leading-tight flex-1 select-none">
                                    I agree to the{' '}
                                    <a
                                        href="/terms"
                                        target="_blank"
                                        className="text-primary hover:underline"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        Terms of Service
                                    </a>
                                    <span className="text-red-500 ml-1">*</span>
                                </span>
                            </label>

                            <label
                                className="flex items-start gap-3 cursor-pointer group"
                                onClick={() => setAgreeToPrivacy(!agreeToPrivacy)}
                            >
                                <div className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center transition-all duration-200 ${agreeToPrivacy
                                        ? 'bg-primary border-primary'
                                        : 'border-muted-foreground/30 bg-accent/10 group-hover:border-primary/50'
                                    }`}>
                                    {agreeToPrivacy && <Check className="w-3.5 h-3.5 text-primary-foreground stroke-[3px]" />}
                                </div>
                                <span className="text-sm text-muted-foreground leading-tight flex-1 select-none">
                                    I agree to the{' '}
                                    <a
                                        href="/privacy"
                                        target="_blank"
                                        className="text-primary hover:underline"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        Privacy Policy
                                    </a>
                                    <span className="text-red-500 ml-1">*</span>
                                </span>
                            </label>
                        </div>

                        {/* Error message */}
                        {submitError && (
                            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                {submitError}
                            </div>
                        )}

                        {/* Submit Button */}
                        <button
                            onClick={handleSubmit}
                            disabled={!canSubmit}
                            className={`w-full py-3.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${canSubmit
                                    ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 shadow-lg shadow-green-500/20'
                                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                                }`}
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Creating Account...
                                </>
                            ) : (
                                <>
                                    <Shield className="w-5 h-5" />
                                    Complete Profile
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default ProfileCompletionModal;
