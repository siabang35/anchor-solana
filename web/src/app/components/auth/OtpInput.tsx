import { useRef, useEffect, useState, ClipboardEvent, KeyboardEvent } from 'react';
import { cn } from '../ui/utils';

interface OtpInputProps {
    length?: number;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    autoFocus?: boolean;
}

export function OtpInput({ length = 6, value, onChange, disabled, autoFocus }: OtpInputProps) {
    const [focusedIndex, setFocusedIndex] = useState<number>(-1);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => {
        if (autoFocus && !disabled) {
            inputRefs.current[0]?.focus();
        }
    }, [autoFocus, disabled]);

    const handleChange = (index: number, char: string) => {
        if (disabled) return;

        // Allow only numbers
        if (!/^\d*$/.test(char)) return;

        const newValue = value.split('');
        newValue[index] = char.slice(-1); // Take only the last character if multiple
        const finalValue = newValue.join('').slice(0, length);

        onChange(finalValue);

        // Auto-advance
        if (char && index < length - 1) {
            inputRefs.current[index + 1]?.focus();
        }
    };

    const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
        if (disabled) return;

        if (e.key === 'Backspace') {
            e.preventDefault();
            if (value[index]) {
                // Clear current
                const newValue = value.split('');
                newValue[index] = '';
                onChange(newValue.join(''));
            } else if (index > 0) {
                // Determine if we should clear previous
                inputRefs.current[index - 1]?.focus();
                // Optional: clear previous on backspace from empty
                const newValue = value.split('');
                newValue[index - 1] = '';
                onChange(newValue.join(''));
            }
        } else if (e.key === 'ArrowLeft' && index > 0) {
            e.preventDefault();
            inputRefs.current[index - 1]?.focus();
        } else if (e.key === 'ArrowRight' && index < length - 1) {
            e.preventDefault();
            inputRefs.current[index + 1]?.focus();
        }
    };

    const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        if (disabled) return;

        const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
        if (pastedData) {
            onChange(pastedData);
            // Focus last filled or next empty
            const nextIndex = Math.min(pastedData.length, length - 1);
            inputRefs.current[nextIndex]?.focus();
        }
    };

    return (
        <div className="flex gap-2 justify-center">
            {Array.from({ length }).map((_, i) => (
                <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="text" // 'text' instead of 'number' to remove spinners and allow better control
                    inputMode="numeric"
                    maxLength={1}
                    value={value[i] || ''}
                    disabled={disabled}
                    onChange={(e) => handleChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    onPaste={handlePaste}
                    onFocus={() => setFocusedIndex(i)}
                    onBlur={() => setFocusedIndex(-1)}
                    className={cn(
                        "w-12 h-14 text-center text-xl font-bold rounded-xl border-2 outline-none transition-all duration-200 bg-background/50 text-foreground dark:text-white",
                        focusedIndex === i
                            ? "border-primary ring-4 ring-primary/10 shadow-[0_0_15px_rgba(var(--primary-rgb),0.3)] scale-105"
                            : "border-border/60 hover:border-border",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                        value[i] ? "border-primary/50 bg-primary/5" : ""
                    )}
                />
            ))}
        </div>
    );
}
