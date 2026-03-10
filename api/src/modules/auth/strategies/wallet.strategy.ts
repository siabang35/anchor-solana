import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import * as nacl from 'tweetnacl';
import bs58 from 'bs58';

export interface WalletVerificationResult {
    isValid: boolean;
    address: string;
    chain: 'ethereum' | 'solana' | 'sui' | 'base';
    error?: string;
}

/**
 * Wallet Strategy Service
 * Handles cryptographic verification for multiple blockchain wallets
 */
@Injectable()
export class WalletStrategy {
    private readonly logger = new Logger(WalletStrategy.name);

    /**
     * Generate a challenge message for wallet signing
     */
    generateChallenge(address: string, chain: string): string {
        const nonce = Math.random().toString(36).substring(2, 15);
        const timestamp = Date.now();
        const domain = 'exoduze.app';

        return `Welcome to ExoDuZe!

Click to sign in and accept the ExoDuZe Terms of Service.

This request will not trigger a blockchain transaction or cost any gas fees.

Wallet: ${address}
Chain: ${chain}
Nonce: ${nonce}
Timestamp: ${timestamp}
Domain: ${domain}`;
    }

    /**
     * Verify a wallet signature
     */
    async verify(
        address: string,
        signature: string,
        message: string,
        chain: 'ethereum' | 'solana' | 'sui' | 'base',
    ): Promise<WalletVerificationResult> {
        try {
            switch (chain) {
                case 'ethereum':
                case 'base':
                    return this.verifyEVM(address, signature, message, chain);
                case 'solana':
                    return this.verifySolana(address, signature, message);
                case 'sui':
                    return this.verifySui(address, signature, message);
                default:
                    return {
                        isValid: false,
                        address,
                        chain,
                        error: `Unsupported chain: ${chain}`,
                    };
            }
        } catch (error) {
            this.logger.error(`Wallet verification failed: ${error}`);
            return {
                isValid: false,
                address,
                chain,
                error: error instanceof Error ? error.message : 'Verification failed',
            };
        }
    }

    /**
     * Verify EVM-compatible signatures (Ethereum, Base, etc.)
     */
    private verifyEVM(
        address: string,
        signature: string,
        message: string,
        chain: 'ethereum' | 'base',
    ): WalletVerificationResult {
        try {
            // Recover signer address from signature
            const recoveredAddress = ethers.verifyMessage(message, signature);

            // Compare addresses (case-insensitive)
            const isValid = recoveredAddress.toLowerCase() === address.toLowerCase();

            return {
                isValid,
                address: recoveredAddress,
                chain,
                error: isValid ? undefined : 'Signature does not match address',
            };
        } catch (error) {
            return {
                isValid: false,
                address,
                chain,
                error: 'Invalid EVM signature format',
            };
        }
    }

    /**
     * Verify Solana signatures
     */
    private verifySolana(
        address: string,
        signature: string,
        message: string,
    ): WalletVerificationResult {
        try {
            // Decode base58 public key and signature
            const publicKeyBytes = bs58.decode(address);
            const signatureBytes = bs58.decode(signature);
            const messageBytes = new TextEncoder().encode(message);

            // Log details for debugging
            this.logger.log(`Verifying Solana: AddrLen=${publicKeyBytes.length}, SigLen=${signatureBytes.length}, MsgLen=${messageBytes.length}`);

            // Verify using nacl
            const isValid = nacl.sign.detached.verify(
                messageBytes,
                signatureBytes,
                publicKeyBytes,
            );

            if (!isValid) this.logger.warn(`Solana verification returned false`);

            return {
                isValid,
                address,
                chain: 'solana',
                error: isValid ? undefined : 'Invalid Solana signature',
            };
        } catch (error) {
            this.logger.error(`Solana verify error: ${error}`);
            return {
                isValid: false,
                address,
                chain: 'solana',
                error: `Invalid Solana signature format: ${error}`,
            };
        }
    }

    /**
     * Verify Sui signatures
     * Note: Sui uses Ed25519 similar to Solana
     */
    /**
     * Verify Sui signatures
     * Uses @mysten/sui.js to handle Personal Message Intent verification
     */
    private async verifySui(
        address: string,
        signature: string,
        message: string,
    ): Promise<WalletVerificationResult> {
        try {
            const { verifyPersonalMessage } = await import('@mysten/sui.js/verify');
            const messageBytes = new TextEncoder().encode(message);

            // Verify signature and get public key (handles Base64 signature parsing internally)
            const publicKey = await verifyPersonalMessage(messageBytes, signature);

            // Recover address
            const recoveredAddress = publicKey.toSuiAddress();

            const isValid = recoveredAddress === address;

            return {
                isValid,
                address: recoveredAddress,
                chain: 'sui',
                error: isValid ? undefined : 'Signature does not match address',
            };
        } catch (error) {
            this.logger.error(`Sui verify error: ${error}`);
            return {
                isValid: false,
                address,
                chain: 'sui',
                error: `Invalid Sui signature: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }
}
