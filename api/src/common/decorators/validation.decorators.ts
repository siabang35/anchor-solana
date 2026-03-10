/**
 * Custom Validation Decorators
 * 
 * Provides enhanced validation decorators for security-critical fields.
 * Includes chain-specific wallet validation, UUID validation, and safe number ranges.
 * 
 * OWASP A03:2021 - Injection Prevention
 */

import {
    registerDecorator,
    ValidationOptions,
    ValidationArguments,
} from 'class-validator';
import { Transform } from 'class-transformer';

// ==========================================
// Wallet Address Patterns
// ==========================================

export const WALLET_PATTERNS = {
    ethereum: /^0x[a-fA-F0-9]{40}$/,
    base: /^0x[a-fA-F0-9]{40}$/,
    solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    sui: /^0x[a-fA-F0-9]{64}$/,
} as const;

export type WalletChain = keyof typeof WALLET_PATTERNS;

/**
 * Validates wallet address format based on chain
 * The chain is read from the same object being validated
 */
export function IsValidWalletAddress(validationOptions?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            name: 'isValidWalletAddress',
            target: object.constructor,
            propertyName: propertyName,
            options: {
                message: 'Invalid wallet address format for the specified chain',
                ...validationOptions,
            },
            validator: {
                validate(value: any, args: ValidationArguments) {
                    if (typeof value !== 'string') return false;

                    const obj = args.object as Record<string, unknown>;
                    const chain = obj.chain as WalletChain;

                    if (!chain || !WALLET_PATTERNS[chain]) {
                        return false;
                    }

                    return WALLET_PATTERNS[chain].test(value);
                },
            },
        });
    };
}

/**
 * Validates that a string matches a specific wallet chain pattern
 */
export function IsWalletAddressForChain(
    chain: WalletChain,
    validationOptions?: ValidationOptions,
) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            name: 'isWalletAddressForChain',
            target: object.constructor,
            propertyName: propertyName,
            constraints: [chain],
            options: {
                message: `Must be a valid ${chain} wallet address`,
                ...validationOptions,
            },
            validator: {
                validate(value: any, args: ValidationArguments) {
                    if (typeof value !== 'string') return false;
                    const [chainType] = args.constraints as [WalletChain];
                    return WALLET_PATTERNS[chainType].test(value);
                },
            },
        });
    };
}

// ==========================================
// UUID Validation
// ==========================================

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates that a string is a valid UUID v4
 */
export function IsUUIDv4(validationOptions?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            name: 'isUUIDv4',
            target: object.constructor,
            propertyName: propertyName,
            options: {
                message: `${propertyName} must be a valid UUID`,
                ...validationOptions,
            },
            validator: {
                validate(value: any) {
                    return typeof value === 'string' && UUID_V4_REGEX.test(value);
                },
            },
        });
    };
}

// ==========================================
// Numeric Validation
// ==========================================

/**
 * Validates numeric value is within safe range and finite
 */
export function IsSafeNumber(
    min: number,
    max: number,
    validationOptions?: ValidationOptions,
) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            name: 'isSafeNumber',
            target: object.constructor,
            propertyName: propertyName,
            constraints: [min, max],
            options: {
                message: `${propertyName} must be between ${min} and ${max}`,
                ...validationOptions,
            },
            validator: {
                validate(value: any, args: ValidationArguments) {
                    const [minVal, maxVal] = args.constraints as [number, number];
                    return (
                        typeof value === 'number' &&
                        !Number.isNaN(value) &&
                        Number.isFinite(value) &&
                        value >= minVal &&
                        value <= maxVal
                    );
                },
            },
        });
    };
}

/**
 * Validates that a number has at most N decimal places
 */
export function MaxDecimalPlaces(
    places: number,
    validationOptions?: ValidationOptions,
) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            name: 'maxDecimalPlaces',
            target: object.constructor,
            propertyName: propertyName,
            constraints: [places],
            options: {
                message: `${propertyName} must have at most ${places} decimal places`,
                ...validationOptions,
            },
            validator: {
                validate(value: any, args: ValidationArguments) {
                    if (typeof value !== 'number') return false;
                    const [maxPlaces] = args.constraints as [number];
                    const decimalPart = value.toString().split('.')[1];
                    return !decimalPart || decimalPart.length <= maxPlaces;
                },
            },
        });
    };
}

// ==========================================
// String Sanitization Transforms
// ==========================================

/**
 * Sanitizes string by removing null bytes and control characters
 */
export function SanitizeString() {
    return Transform(({ value }) => {
        if (typeof value !== 'string') return value;
        // Remove null bytes and control characters (except newlines and tabs for textareas)
        return value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trim();
    });
}

/**
 * Normalizes and sanitizes email addresses
 */
export function NormalizeEmail() {
    return Transform(({ value }) => {
        if (typeof value !== 'string') return value;
        return value.toLowerCase().trim();
    });
}

/**
 * Trims whitespace from string
 */
export function TrimString() {
    return Transform(({ value }) => {
        if (typeof value !== 'string') return value;
        return value.trim();
    });
}

/**
 * Converts to lowercase and trims
 */
export function LowercaseTrim() {
    return Transform(({ value }) => {
        if (typeof value !== 'string') return value;
        return value.toLowerCase().trim();
    });
}

// ==========================================
// Security Validators
// ==========================================

/**
 * Validates that string doesn't contain prototype pollution patterns
 */
export function NoPrototypePollution(validationOptions?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            name: 'noPrototypePollution',
            target: object.constructor,
            propertyName: propertyName,
            options: {
                message: 'Invalid input detected',
                ...validationOptions,
            },
            validator: {
                validate(value: any) {
                    if (typeof value !== 'string') return true;
                    const dangerous = ['__proto__', 'constructor', 'prototype'];
                    return !dangerous.some(d => value.includes(d));
                },
            },
        });
    };
}

/**
 * Validates hex string (like transaction hashes, signatures)
 */
export function IsHexString(
    minLength?: number,
    maxLength?: number,
    validationOptions?: ValidationOptions,
) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            name: 'isHexString',
            target: object.constructor,
            propertyName: propertyName,
            constraints: [minLength, maxLength],
            options: {
                message: `${propertyName} must be a valid hex string`,
                ...validationOptions,
            },
            validator: {
                validate(value: any, args: ValidationArguments) {
                    if (typeof value !== 'string') return false;

                    const [min, max] = args.constraints as [number | undefined, number | undefined];

                    // Check format (with or without 0x prefix)
                    const hexValue = value.startsWith('0x') ? value.slice(2) : value;
                    if (!/^[a-fA-F0-9]*$/.test(hexValue)) return false;

                    // Check length
                    if (min !== undefined && hexValue.length < min) return false;
                    if (max !== undefined && hexValue.length > max) return false;

                    return true;
                },
            },
        });
    };
}

/**
 * Validates idempotency key format
 */
export function IsIdempotencyKey(validationOptions?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            name: 'isIdempotencyKey',
            target: object.constructor,
            propertyName: propertyName,
            options: {
                message: 'Idempotency key must be a valid UUID v4',
                ...validationOptions,
            },
            validator: {
                validate(value: any) {
                    return typeof value === 'string' && UUID_V4_REGEX.test(value);
                },
            },
        });
    };
}
