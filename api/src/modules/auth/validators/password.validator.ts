import { Injectable } from '@nestjs/common';

export interface PasswordValidationResult {
    isValid: boolean;
    score: number; // 0-5, higher is stronger
    errors: string[];
    suggestions: string[];
}

/**
 * Password Validator Service
 * Provides comprehensive password strength validation
 */
@Injectable()
export class PasswordValidator {
    // Common weak passwords to reject
    private readonly commonPasswords = new Set([
        'password',
        '123456',
        '12345678',
        'qwerty',
        'abc123',
        'password123',
        'admin123',
        'letmein',
        'welcome',
        'monkey',
        'dragon',
        'master',
        'iloveyou',
        'trustno1',
    ]);

    /**
     * Validate password strength
     */
    validate(password: string, email?: string): PasswordValidationResult {
        const errors: string[] = [];
        const suggestions: string[] = [];
        let score = 0;

        // Minimum length check
        if (password.length < 8) {
            errors.push('Password must be at least 8 characters long');
        } else if (password.length >= 12) {
            score += 1;
        }

        if (password.length >= 16) {
            score += 1;
        }

        // Uppercase check
        if (!/[A-Z]/.test(password)) {
            errors.push('Password must contain at least one uppercase letter');
        } else {
            score += 1;
        }

        // Lowercase check
        if (!/[a-z]/.test(password)) {
            errors.push('Password must contain at least one lowercase letter');
        } else {
            score += 1;
        }

        // Number check
        if (!/\d/.test(password)) {
            errors.push('Password must contain at least one number');
        } else {
            score += 1;
        }

        // Special character check
        if (!/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;'/`~]/.test(password)) {
            suggestions.push('Add a special character for stronger security');
        } else {
            score += 1;
        }

        // Common password check
        if (this.commonPasswords.has(password.toLowerCase())) {
            errors.push('This password is too common and easily guessable');
            score = 0;
        }

        // Check if password contains email username
        if (email) {
            const username = email.split('@')[0].toLowerCase();
            if (username.length >= 3 && password.toLowerCase().includes(username)) {
                errors.push('Password should not contain your email username');
                score = Math.max(0, score - 2);
            }
        }

        // Sequential characters check
        if (this.hasSequentialChars(password)) {
            suggestions.push('Avoid sequential characters like "abc" or "123"');
            score = Math.max(0, score - 1);
        }

        // Repeated characters check
        if (/(.)\1{2,}/.test(password)) {
            suggestions.push('Avoid repeating the same character multiple times');
            score = Math.max(0, score - 1);
        }

        // Keyboard pattern check
        if (this.hasKeyboardPattern(password)) {
            suggestions.push('Avoid keyboard patterns like "qwerty" or "asdf"');
            score = Math.max(0, score - 1);
        }

        // Add suggestions for weak passwords
        if (score < 3) {
            if (password.length < 12) {
                suggestions.push('Use at least 12 characters for better security');
            }
            if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
                suggestions.push('Include special characters like !@#$%^&*');
            }
        }

        return {
            isValid: errors.length === 0,
            score: Math.min(5, Math.max(0, score)),
            errors,
            suggestions,
        };
    }

    /**
     * Check for sequential characters (abc, 123, etc.)
     */
    private hasSequentialChars(password: string): boolean {
        const lowerPass = password.toLowerCase();
        for (let i = 0; i < lowerPass.length - 2; i++) {
            const c1 = lowerPass.charCodeAt(i);
            const c2 = lowerPass.charCodeAt(i + 1);
            const c3 = lowerPass.charCodeAt(i + 2);

            if (c2 === c1 + 1 && c3 === c2 + 1) {
                return true; // Ascending sequence
            }
            if (c2 === c1 - 1 && c3 === c2 - 1) {
                return true; // Descending sequence
            }
        }
        return false;
    }

    /**
     * Check for common keyboard patterns
     */
    private hasKeyboardPattern(password: string): boolean {
        const patterns = [
            'qwerty',
            'asdfgh',
            'zxcvbn',
            'qwertyuiop',
            'asdfghjkl',
            'zxcvbnm',
            '1qaz',
            '2wsx',
            '3edc',
            '!qaz',
            '@wsx',
            '#edc',
        ];

        const lowerPass = password.toLowerCase();
        return patterns.some((pattern) => lowerPass.includes(pattern));
    }

    /**
     * Get password strength label
     */
    getStrengthLabel(score: number): string {
        if (score <= 1) return 'Very Weak';
        if (score === 2) return 'Weak';
        if (score === 3) return 'Fair';
        if (score === 4) return 'Strong';
        return 'Very Strong';
    }
}
