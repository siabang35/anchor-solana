import {
    Injectable,
    Logger,
    BadRequestException,
    NotFoundException,
    ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHmac } from 'crypto';
import { SupabaseService } from '../../database/supabase.service.js';
import { PrivyService } from './services/privy.service.js';
import {
    InitiateDepositDto,
    VerifyDepositDto,
    DepositHistoryQueryDto,
    DepositChain,
    DepositStatus,
    BalanceResponseDto,
    InitiateDepositResponseDto,
    DepositTransactionDto,
    InitiateWithdrawalDto,
    ConfirmWithdrawalDto,
    WithdrawalResponseDto,
} from './dto/index.js';

/**
 * Pending deposit cache entry
 */
interface PendingDeposit {
    userId: string;
    amount: number;
    chain: DepositChain;
    createdAt: number;
    expiresAt: number;
}

/**
 * DepositService
 * 
 * Handles deposit operations with enterprise-grade security:
 * - Nonce-based anti-replay protection
 * - Amount bounds validation
 * - Transaction verification
 * - Balance management
 */
@Injectable()
export class DepositService {
    private readonly logger = new Logger(DepositService.name);

    // In-memory nonce cache (for production, use Redis)
    private readonly pendingDeposits = new Map<string, PendingDeposit>();

    // Deposit configuration
    private readonly minAmount: number;
    private readonly maxAmount: number;
    private readonly nonceExpirySeconds: number;
    private readonly nonceSecret: string;

    // Deposit addresses per chain (in production, these would be dynamic)
    private readonly depositAddresses: Record<DepositChain, string> = {
        [DepositChain.ETHEREUM]: '0x742d35Cc6634C0532925a3b844Bc9e7595f3bD1d',
        [DepositChain.SOLANA]: 'DjVE6JNiYqPL2QXyCUUh8rNjHrbz9hXHNYt99MQ59qw1',
        [DepositChain.SUI]: '0x02a212de6a9dfa3a69e22387acfbafbb1a9e591c',
        [DepositChain.BASE]: '0x742d35Cc6634C0532925a3b844Bc9e7595f3bD1d',
    };

    constructor(
        private readonly configService: ConfigService,
        private readonly supabaseService: SupabaseService,
        private readonly privyService: PrivyService,
    ) {
        this.minAmount = this.configService.get<number>('DEPOSIT_MIN_AMOUNT', 1);
        this.maxAmount = this.configService.get<number>('DEPOSIT_MAX_AMOUNT', 100000);
        this.nonceExpirySeconds = this.configService.get<number>('DEPOSIT_NONCE_EXPIRY_SECONDS', 300);
        this.nonceSecret = this.configService.get<string>(
            'DEPOSIT_NONCE_SECRET',
            'default-nonce-secret-change-in-production'
        );

        // Cleanup expired nonces periodically
        setInterval(() => this.cleanupExpiredNonces(), 60000);
    }

    /**
     * Generate HMAC signature for a nonce
     * Provides tamper detection for deposit nonces
     */
    private signNonce(nonce: string): string {
        return createHmac('sha256', this.nonceSecret)
            .update(nonce)
            .digest('hex');
    }

    /**
     * Verify HMAC signature for a nonce
     */
    private verifyNonceSignature(signedNonce: string): { nonce: string; valid: boolean } {
        const parts = signedNonce.split('.');
        if (parts.length !== 2) {
            // Legacy nonce without signature - still accept but log warning
            if (signedNonce.startsWith('dep_')) {
                this.logger.warn(`Legacy unsigned nonce received: ${signedNonce.slice(0, 20)}...`);
                return { nonce: signedNonce, valid: true };
            }
            return { nonce: signedNonce, valid: false };
        }

        const [nonce, signature] = parts;
        const expectedSignature = this.signNonce(nonce);
        const valid = signature === expectedSignature;

        if (!valid) {
            this.logger.warn(`Invalid nonce signature detected: ${nonce.slice(0, 20)}...`);
        }

        return { nonce, valid };
    }

    /**
     * Get SUI balance from Mainnet
     */
    private async getSuiBalance(address: string): Promise<string> {
        try {
            const response = await fetch('https://fullnode.mainnet.sui.io:443', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'suix_getBalance',
                    params: [address]
                }),
            });

            if (!response.ok) {
                throw new Error(`SUI RPC error: ${response.status}`);
            }

            const data = await response.json() as { result?: { totalBalance?: string }, error?: any };

            if (data.error) {
                throw new Error(`SUI RPC error: ${JSON.stringify(data.error)}`);
            }

            // SUI has 9 decimals
            const rawBalance = data.result?.totalBalance || '0';
            return (parseInt(rawBalance) / 1_000_000_000).toFixed(4);
        } catch (error) {
            this.logger.error(`Error fetching SUI balance for ${address}`, error);
            return '0';
        }
    }

    /**
     * Get Token Prices from Binance
     */
    private async getTokenPrices(): Promise<Record<string, number>> {
        try {
            const symbols = ['ETHUSDT', 'SOLUSDT', 'SUIUSDT', 'BTCUSDT', 'DAIUSDT'];
            // Free public API, no key needed
            const response = await fetch('https://api.binance.com/api/v3/ticker/price');

            if (!response.ok) return {};

            const data = await response.json() as Array<{ symbol: string, price: string }>;
            const prices: Record<string, number> = {};

            data.forEach(item => {
                if (symbols.includes(item.symbol)) {
                    prices[item.symbol] = parseFloat(item.price);
                }
            });

            // Stablecoins are pegged
            prices['USDCUSDT'] = 1.0;
            prices['USDTUSDT'] = 1.0;

            return prices;
        } catch (error) {
            this.logger.warn('Failed to fetch token prices from Binance', error);
            return {};
        }
    }

    async getBalance(userId: string): Promise<BalanceResponseDto> {
        const client = this.supabaseService.getAdminClient();

        // Fetch prices in parallel with balance
        const pricesPromise = this.getTokenPrices();

        const { data, error } = await client
            .from('user_balances')
            .select('*')
            .eq('user_id', userId)
            .eq('currency', 'USDC')
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
            this.logger.error(`Failed to fetch balance for user ${userId}`, error);
            throw new BadRequestException('Failed to fetch balance');
        }

        const balance = parseFloat(data?.balance || '0');
        const lockedBalance = parseFloat(data?.locked_balance || '0');
        const availableBalance = balance - lockedBalance;

        // Fetch balances for all supported chains
        const assets: Array<{ symbol: string; balance: string; chain: string; valueUsd: string; address?: string }> = [];
        const chains = Object.values(DepositChain);

        // Wait for prices
        const prices = await pricesPromise;

        for (const chain of chains) {
            let assetBalance = '0.0000';
            let address: string | undefined;

            try {
                // Get wallet if exists
                const wallet = await this.getPrivyWallet(userId, chain);
                if (wallet) {
                    address = wallet.address;
                    // For SUI, fetch real balance
                    if (chain === DepositChain.SUI) {
                        assetBalance = await this.getSuiBalance(wallet.address);
                    }
                    // For others, currently 0 (or implement RPC calls later)
                }

                // Calculate Value
                const symbol = chain === DepositChain.ETHEREUM ? 'ETH' :
                    chain === DepositChain.SOLANA ? 'SOL' :
                        chain === DepositChain.SUI ? 'SUI' : 'ETH'; // Base uses ETH price roughly

                const ticker = `${symbol}USDT`;
                const price = prices[ticker] || 0;
                const valueUsd = (parseFloat(assetBalance) * price).toFixed(2);

                assets.push({
                    symbol: chain.toUpperCase(), // e.g. ETHEREUM -> ETHEREUM (frontend can map to ETH)
                    balance: assetBalance,
                    chain: chain,
                    valueUsd: valueUsd,
                    address: address
                });

                // --- Inject ERC20s for Ethereum ---
                if (chain === DepositChain.ETHEREUM && address) {
                    const erc20s = [
                        { symbol: 'USDC', ticker: 'USDCUSDT' },
                        { symbol: 'USDT', ticker: 'USDTUSDT' },
                        { symbol: 'WBTC', ticker: 'BTCUSDT' }, // WBTC tracks BTC
                        { symbol: 'DAI', ticker: 'DAIUSDT' }
                    ];

                    for (const token of erc20s) {
                        // TODO: Implement real `balanceOf` call here
                        const tokenBalance = '0.0000';
                        const tokenPrice = prices[token.ticker] || 0;
                        const tokenValue = (parseFloat(tokenBalance) * tokenPrice).toFixed(2);

                        assets.push({
                            symbol: token.symbol,
                            balance: tokenBalance,
                            chain: chain, // Still on Ethereum chain
                            valueUsd: tokenValue,
                            address: address // Same ETH address
                        });
                    }
                }
                // ----------------------------------

            } catch (error) {
                this.logger.warn(`Failed to process asset ${chain} for user ${userId}`, error);

                // Still add the main chain asset with 0 balance
                assets.push({
                    symbol: chain.toUpperCase(),
                    balance: '0.0000',
                    chain: chain,
                    valueUsd: '0.00'
                });
            }
        }

        return {
            balance: balance.toFixed(2),
            lockedBalance: lockedBalance.toFixed(2),
            availableBalance: availableBalance.toFixed(2),
            currency: 'USDC',
            assets,
        };
    }

    /**
     * Initiate a new deposit
     * Returns HMAC-signed nonce and deposit address
     * 
     * OWASP A02:2021 - Cryptographic Failures
     * Uses 256-bit entropy for nonces and HMAC for integrity
     */
    async initiateDeposit(
        userId: string,
        dto: InitiateDepositDto,
    ): Promise<InitiateDepositResponseDto> {
        // Validate amount bounds
        if (dto.amount < this.minAmount || dto.amount > this.maxAmount) {
            throw new BadRequestException(
                `Deposit amount must be between $${this.minAmount} and $${this.maxAmount}`
            );
        }

        // Generate unique nonce with 256-bit entropy (32 bytes)
        const nonceBase = `dep_${randomBytes(32).toString('hex')}`;
        const nonceSignature = this.signNonce(nonceBase);
        const signedNonce = `${nonceBase}.${nonceSignature}`;

        const now = Date.now();
        const expiresAt = now + this.nonceExpirySeconds * 1000;
        const depositAddress = this.depositAddresses[dto.chain];

        // Store pending deposit (use base nonce for lookups)
        this.pendingDeposits.set(nonceBase, {
            userId,
            amount: dto.amount,
            chain: dto.chain,
            createdAt: now,
            expiresAt,
        });

        // Create pending transaction in database (store base nonce)
        const client = this.supabaseService.getAdminClient();
        const { error } = await client
            .from('deposit_transactions')
            .insert({
                user_id: userId,
                amount: dto.amount,
                currency: 'USDC',
                chain: dto.chain,
                to_address: depositAddress,
                status: DepositStatus.PENDING,
                nonce: nonceBase, // Store base nonce, not signed
                expires_at: new Date(expiresAt).toISOString(),
            });

        if (error) {
            this.logger.error('Failed to create deposit transaction', error);
            this.pendingDeposits.delete(nonceBase);
            throw new BadRequestException('Failed to initiate deposit');
        }

        this.logger.log(`Deposit initiated: ${nonceBase.slice(0, 20)}... for user ${userId}, amount: ${dto.amount} ${dto.chain}`);

        return {
            nonce: signedNonce, // Return signed nonce to client
            depositAddress,
            expiresInSeconds: this.nonceExpirySeconds,
            amount: dto.amount.toFixed(2),
            chain: dto.chain,
        };
    }

    /**
     * Verify and confirm a deposit transaction
     * 
     * OWASP A02:2021 - Cryptographic Failures
     * Validates HMAC signature on nonce to prevent tampering
     */
    async verifyDeposit(
        userId: string,
        dto: VerifyDepositDto,
    ): Promise<DepositTransactionDto> {
        // Verify and extract nonce from signed format
        const { nonce, valid: signatureValid } = this.verifyNonceSignature(dto.nonce);

        if (!signatureValid) {
            this.logger.warn(`Invalid nonce signature from user ${userId}`);
            throw new BadRequestException('Invalid or tampered deposit nonce');
        }

        // Validate nonce exists and belongs to user
        const pending = this.pendingDeposits.get(nonce);

        if (!pending) {
            // Check if it's in database but not in memory (after restart)
            const dbPending = await this.getPendingFromDb(nonce);
            if (!dbPending) {
                throw new NotFoundException('Invalid or expired deposit nonce');
            }
            if (dbPending.user_id !== userId) {
                this.logger.warn(`User ${userId} attempted to verify deposit belonging to ${dbPending.user_id}`);
                throw new BadRequestException('Invalid deposit');
            }
        } else {
            // Validate from memory
            if (pending.userId !== userId) {
                this.logger.warn(`User ${userId} attempted to verify deposit belonging to ${pending.userId}`);
                throw new BadRequestException('Invalid deposit');
            }
            if (Date.now() > pending.expiresAt) {
                this.pendingDeposits.delete(nonce);
                await this.updateDepositStatus(nonce, DepositStatus.EXPIRED);
                throw new BadRequestException('Deposit session has expired');
            }
        }

        // Verify Privy token if provided (for embedded wallet transactions)
        if (dto.privyToken) {
            try {
                await this.privyService.verifyToken(dto.privyToken);
            } catch {
                throw new BadRequestException('Invalid Privy authentication');
            }
        }

        // Verify transaction on blockchain (placeholder - implement actual verification)
        const isValid = await this.verifyBlockchainTransaction(
            dto.txHash,
            pending?.chain || DepositChain.BASE,
            pending?.amount || 0,
        );

        if (!isValid) {
            throw new BadRequestException('Transaction verification failed');
        }

        // Update transaction status
        const client = this.supabaseService.getAdminClient();
        const { data: transaction, error: updateError } = await client
            .from('deposit_transactions')
            .update({
                status: DepositStatus.CONFIRMED,
                tx_hash: dto.txHash,
                confirmed_at: new Date().toISOString(),
            })
            .eq('nonce', nonce)
            .select()
            .single();

        if (updateError) {
            this.logger.error('Failed to confirm deposit', updateError);
            throw new BadRequestException('Failed to confirm deposit');
        }

        // Credit user balance
        await this.creditBalance(userId, pending?.amount || transaction.amount);

        // Cleanup
        this.pendingDeposits.delete(nonce);

        this.logger.log(`Deposit confirmed: ${nonce.slice(0, 20)}..., txHash: ${dto.txHash}`);

        return this.mapToTransactionDto(transaction);
    }

    /**
     * Get deposit history for user
     */
    async getHistory(
        userId: string,
        query: DepositHistoryQueryDto,
    ): Promise<{ data: DepositTransactionDto[]; total: number }> {
        const client = this.supabaseService.getAdminClient();

        let queryBuilder = client
            .from('deposit_transactions')
            .select('*', { count: 'exact' })
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        // Apply filters
        if (query.status) {
            queryBuilder = queryBuilder.eq('status', query.status);
        }
        if (query.chain) {
            queryBuilder = queryBuilder.eq('chain', query.chain);
        }

        // Pagination
        const offset = ((query.page || 1) - 1) * (query.limit || 20);
        queryBuilder = queryBuilder.range(offset, offset + (query.limit || 20) - 1);

        const { data, error, count } = await queryBuilder;

        if (error) {
            this.logger.error('Failed to fetch deposit history', error);
            throw new BadRequestException('Failed to fetch history');
        }

        return {
            data: (data || []).map(tx => this.mapToTransactionDto(tx)),
            total: count || 0,
        };
    }

    /**
     * Credit user balance
     */
    private async creditBalance(userId: string, amount: number): Promise<void> {
        const client = this.supabaseService.getAdminClient();

        // Upsert balance (create if not exists, increment if exists)
        const { error } = await client.rpc('credit_user_balance', {
            p_user_id: userId,
            p_amount: amount,
            p_currency: 'USDC',
        });

        if (error) {
            // Fallback: direct insert/update
            const { data: existing } = await client
                .from('user_balances')
                .select('balance')
                .eq('user_id', userId)
                .eq('currency', 'USDC')
                .single();

            if (existing) {
                await client
                    .from('user_balances')
                    .update({
                        balance: parseFloat(existing.balance) + amount,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('user_id', userId)
                    .eq('currency', 'USDC');
            } else {
                await client
                    .from('user_balances')
                    .insert({
                        user_id: userId,
                        balance: amount,
                        currency: 'USDC',
                    });
            }
        }

        this.logger.log(`Credited ${amount} USDC to user ${userId}`);
    }

    /**
     * Verify blockchain transaction (placeholder)
     * In production, integrate with blockchain RPC or indexer
     */
    private async verifyBlockchainTransaction(
        _txHash: string,
        _chain: DepositChain,
        _expectedAmount: number,
    ): Promise<boolean> {
        // TODO: Implement actual blockchain verification
        // For now, accept all transactions (development mode)
        this.logger.warn('Blockchain verification not implemented - accepting transaction');
        return true;
    }

    /**
     * Get pending deposit from database
     */
    private async getPendingFromDb(nonce: string): Promise<any> {
        const client = this.supabaseService.getAdminClient();
        const { data } = await client
            .from('deposit_transactions')
            .select('*')
            .eq('nonce', nonce)
            .eq('status', DepositStatus.PENDING)
            .single();
        return data;
    }

    /**
     * Update deposit status in database
     */
    private async updateDepositStatus(nonce: string, status: DepositStatus): Promise<void> {
        const client = this.supabaseService.getAdminClient();
        await client
            .from('deposit_transactions')
            .update({ status })
            .eq('nonce', nonce);
    }

    /**
     * Map database record to DTO
     */
    private mapToTransactionDto(record: any): DepositTransactionDto {
        return {
            id: record.id,
            amount: parseFloat(record.amount).toFixed(2),
            currency: record.currency || 'USDC',
            chain: record.chain,
            txHash: record.tx_hash,
            status: record.status,
            createdAt: record.created_at,
            confirmedAt: record.confirmed_at,
        };
    }

    /**
     * Save Privy wallet to database
     */
    async savePrivyWallet(userId: string, wallet: {
        privyUserId: string;
        walletAddress: string;
        chain: string;
        walletType: string;
    }): Promise<void> {
        const client = this.supabaseService.getAdminClient();

        const { error } = await client
            .from('privy_wallets')
            .upsert({
                user_id: userId,
                privy_user_id: wallet.privyUserId,
                wallet_address: wallet.walletAddress,
                chain: wallet.chain,
                wallet_type: wallet.walletType,
                is_active: true,
                last_used_at: new Date().toISOString(),
            }, {
                onConflict: 'user_id,chain',
            });

        if (error) {
            this.logger.error('Failed to save Privy wallet', error);
        } else {
            this.logger.log(`Saved Privy wallet ${wallet.walletAddress} for user ${userId}`);
        }
    }

    /**
     * Get or create deposit wallet for user
     * Handles mapping between Supabase UUID and Privy DID
     * 
     * SECURITY: Validates address format and regenerates if cached wallet is invalid
     */
    async getOrCreateDepositWallet(userId: string, chain: string): Promise<any> {
        let chainType: 'ethereum' | 'solana' | 'sui' = 'ethereum';
        if (chain === 'solana') chainType = 'solana';
        if (chain === 'sui') chainType = 'sui';

        // 1. Check local DB first
        const existing = await this.getPrivyWallet(userId, chain as DepositChain);
        if (existing) {
            // Validate the cached address format
            if (this.privyService.isValidAddressFormat(existing.address, chainType)) {
                this.logger.debug(`Using cached ${chain} wallet: ${existing.address}`);
                return existing;
            } else {
                // Invalid format - clear the cached wallet and regenerate
                this.logger.warn(
                    `Cached ${chain} wallet has invalid format: ${existing.address}. ` +
                    `Clearing cached wallet and regenerating.`
                );
                await this.clearInvalidWallet(userId, chain as DepositChain);
            }
        }

        // 2. Ensure user exists in Privy (Import if needed)
        const privyDid = await this.ensurePrivyUser(userId);

        // 3. Get or create wallet in Privy (with built-in validation)
        this.logger.log(`Generating new ${chain} wallet for user ${userId}`);
        const privyWallet = await this.privyService.getOrCreateWallet(privyDid, chainType);

        // 4. Final validation before saving
        if (!this.privyService.isValidAddressFormat(privyWallet.address, chainType)) {
            this.logger.error(
                `Privy returned invalid ${chainType} address: ${privyWallet.address}. ` +
                `Expected ${chainType === 'sui' ? '66' : chainType === 'ethereum' ? '42' : '32-44'} chars.`
            );
            throw new BadRequestException(`Failed to generate valid ${chain} wallet`);
        }

        // 5. Save to DB
        await this.savePrivyWallet(userId, {
            privyUserId: privyDid,
            walletAddress: privyWallet.address,
            chain: chain,
            walletType: 'embedded',
        });

        this.logger.log(`Successfully created ${chain} wallet: ${privyWallet.address.slice(0, 10)}...`);

        return {
            address: privyWallet.address,
            chain: chain,
            walletType: 'embedded',
            createdAt: privyWallet.created_at,
        };
    }

    /**
     * Clear an invalid cached wallet to force regeneration
     */
    private async clearInvalidWallet(userId: string, chain: DepositChain): Promise<void> {
        const client = this.supabaseService.getAdminClient();

        const { error } = await client
            .from('privy_wallets')
            .update({ is_active: false })
            .eq('user_id', userId)
            .eq('chain', chain);

        if (error) {
            this.logger.error(`Failed to clear invalid ${chain} wallet for user ${userId}`, error);
        } else {
            this.logger.log(`Cleared invalid ${chain} wallet cache for user ${userId}`);
        }
    }


    /**
     * Ensure user exists in Privy and get their DID
     */
    async ensurePrivyUser(userId: string): Promise<string> {
        const client = this.supabaseService.getAdminClient();

        // 1. Check if we already have the Privy DID
        const { data: profile } = await client
            .from('profiles')
            .select('privy_user_id')
            .eq('id', userId)
            .single();

        if (profile?.privy_user_id) {
            return profile.privy_user_id;
        }

        // 2. Import user to Privy
        try {
            const privyUser = await this.privyService.importUser(userId);

            // 3. Save DID to profiles
            await client
                .from('profiles')
                .update({ privy_user_id: privyUser.id })
                .eq('id', userId);

            return privyUser.id;
        } catch (error) {
            this.logger.error(`Failed to ensure Privy user for ${userId}`, error);
            // Re-throw to be handled by controller
            throw error;
        }
    }

    /**
     * Get user's Privy wallet for a specific chain
     */
    async getPrivyWallet(userId: string, chain: DepositChain): Promise<{
        address: string;
        chain: string;
        walletType: string;
        createdAt: string;
    } | null> {
        const client = this.supabaseService.getAdminClient();

        const { data, error } = await client
            .from('privy_wallets')
            .select('*')
            .eq('user_id', userId)
            .eq('chain', chain)
            .eq('is_active', true)
            .single();

        if (error || !data) {
            return null;
        }

        // Validate SUI address format (must be 66 chars: 0x + 64 hex)
        // This handles legacy invalid data where EVM addresses were created for SUI
        if (chain === DepositChain.SUI && data.wallet_address.length !== 66) {
            this.logger.warn(`Found invalid SUI address ${data.wallet_address} for user ${userId}, ignoring`);
            return null;
        }

        return {
            address: data.wallet_address,
            chain: data.chain,
            walletType: data.wallet_type,
            createdAt: data.created_at,
        };
    }

    /**
     * Get all Privy wallets for a user
     */
    async getAllPrivyWallets(userId: string): Promise<Array<{
        address: string;
        chain: string;
        walletType: string;
        createdAt: string;
    }>> {
        const client = this.supabaseService.getAdminClient();

        const { data, error } = await client
            .from('privy_wallets')
            .select('*')
            .eq('user_id', userId)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error || !data) {
            return [];
        }

        return data.map(wallet => ({
            address: wallet.wallet_address,
            chain: wallet.chain,
            walletType: wallet.wallet_type,
            createdAt: wallet.created_at,
        }));
    }

    /**
     * Cleanup expired nonces from memory
     */
    private cleanupExpiredNonces(): void {
        const now = Date.now();
        let cleaned = 0;

        for (const [nonce, deposit] of this.pendingDeposits.entries()) {
            if (now > deposit.expiresAt) {
                this.pendingDeposits.delete(nonce);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            this.logger.debug(`Cleaned up ${cleaned} expired deposit nonces`);
        }
    }

    /**
     * Initiate a withdrawal
     */
    async initiateWithdrawal(
        userId: string,
        dto: InitiateWithdrawalDto,
    ): Promise<WithdrawalResponseDto> {
        const client = this.supabaseService.getAdminClient();

        // 1. Check available balance
        const { data: availableBalance, error: balanceError } = await client.rpc(
            'get_available_balance',
            { p_user_id: userId, p_currency: 'USDC' }
        );

        if (balanceError) {
            this.logger.error('Failed to check balance', balanceError);
            throw new BadRequestException('Failed to check balance');
        }

        if (availableBalance < dto.amount) {
            throw new BadRequestException('Insufficient available balance');
        }

        // 2. Lock balance
        const { data: lockSuccess, error: lockError } = await client.rpc(
            'lock_user_balance',
            { p_user_id: userId, p_amount: dto.amount, p_currency: 'USDC' }
        );

        if (lockError || !lockSuccess) {
            this.logger.error('Failed to lock balance for withdrawal', lockError);
            throw new BadRequestException('Failed to process withdrawal');
        }

        // 3. Create withdrawal record
        const { data: withdrawal, error: txError } = await client
            .from('withdrawal_transactions')
            .insert({
                user_id: userId,
                amount: dto.amount,
                currency: 'USDC',
                chain: dto.chain,
                to_address: dto.toAddress,
                status: 'pending',
                metadata: {
                    initiated_via: 'privy_embedded',
                    ip_address: '0.0.0.0', // Should be passed from controller
                }
            })
            .select()
            .single();

        if (txError || !withdrawal) {
            // Rollback lock if insert fails
            await client.rpc('unlock_user_balance', {
                p_user_id: userId,
                p_amount: dto.amount,
                p_currency: 'USDC'
            });
            this.logger.error('Failed to create withdrawal record', txError);
            throw new BadRequestException('Failed to create withdrawal record');
        }

        return {
            id: withdrawal.id,
            amount: withdrawal.amount,
            currency: withdrawal.currency,
            chain: withdrawal.chain,
            toAddress: withdrawal.to_address,
            status: DepositStatus[withdrawal.status.toUpperCase()] || DepositStatus.PENDING,
            createdAt: withdrawal.created_at,
        };
    }

    /**
     * Confirm a withdrawal
     */
    async confirmWithdrawal(
        userId: string,
        dto: ConfirmWithdrawalDto,
    ): Promise<WithdrawalResponseDto> {
        const client = this.supabaseService.getAdminClient();

        // 1. Fetch withdrawal
        const { data: withdrawal, error: fetchError } = await client
            .from('withdrawal_transactions')
            .select('*')
            .eq('id', dto.withdrawalId)
            // .eq('user_id', userId) // RLS handles this usually, but admin client bypasses RLS, so manual check needed
            .single();

        if (fetchError || !withdrawal) {
            throw new NotFoundException('Withdrawal request not found');
        }

        if (withdrawal.user_id !== userId) {
            throw new NotFoundException('Withdrawal request not found');
        }

        if (withdrawal.status === 'completed') {
            return {
                id: withdrawal.id,
                amount: withdrawal.amount,
                currency: withdrawal.currency,
                chain: withdrawal.chain,
                toAddress: withdrawal.to_address,
                status: DepositStatus.CONFIRMED,
                createdAt: withdrawal.created_at,
            };
        }

        if (withdrawal.status !== 'pending' && withdrawal.status !== 'processing') {
            throw new BadRequestException(`Withdrawal is in ${withdrawal.status} state`);
        }

        // 2. Finalize logic: Unlock then Debit
        // Unlock first to make funds available for debit
        const { error: unlockError } = await client.rpc('unlock_user_balance', {
            p_user_id: userId,
            p_amount: withdrawal.amount,
            p_currency: 'USDC'
        });

        if (unlockError) {
            this.logger.error('Failed to unlock balance during confirmation', unlockError);
            throw new BadRequestException('System error during confirmation');
        }

        // Debit the actual amount
        const { error: debitError } = await client.rpc('debit_user_balance', {
            p_user_id: userId,
            p_amount: withdrawal.amount,
            p_currency: 'USDC'
        });

        if (debitError) {
            this.logger.error('Failed to debit balance during confirmation', debitError);
            // Critical error: Funds unlocked but not debited.
            // In production, this needs urgent alert or transaction rollback mechanism.
            throw new BadRequestException('System error during finalization');
        }

        // 3. Update status
        const { data: updated, error: updateError } = await client
            .from('withdrawal_transactions')
            .update({
                status: 'completed',
                tx_hash: dto.txHash,
                completed_at: new Date().toISOString(),
            })
            .eq('id', dto.withdrawalId)
            .select()
            .single();

        if (updateError) {
            this.logger.error('Failed to update withdrawal status', updateError);
            // Funds debited but status not updated.
            throw new BadRequestException('Failed to update withdrawal status');
        }

        return {
            id: updated.id,
            amount: updated.amount,
            currency: updated.currency,
            chain: updated.chain,
            toAddress: updated.to_address,
            status: DepositStatus.CONFIRMED,
            createdAt: updated.created_at,
        };
    }
}
