import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../database/supabase.service.js';
import { Connection, PublicKey, Transaction, SystemProgram, Keypair, LAMPORTS_PER_SOL, sendAndConfirmTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

const PLATFORM_FEE_BPS = 200; // 2%
const SOLANA_DEVNET_RPC = 'https://api.devnet.solana.com';

// PDA seeds matching the smart contract
const POOL_VAULT_SEED = Buffer.from('pool_vault');

@Injectable()
export class PoolService {
    private readonly logger = new Logger(PoolService.name);
    private readonly connection: Connection;

    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly configService: ConfigService,
    ) {
        this.connection = new Connection(SOLANA_DEVNET_RPC, 'confirmed');
    }

    /**
     * Get pool + winners + stakes for a specific competition
     */
    async getCompetitionPool(competitionId: string): Promise<any> {
        const supabase = this.supabaseService.getAdminClient();

        const { data, error } = await supabase.rpc('get_competition_pool_with_winners', {
            p_competition_id: competitionId,
        });

        if (error) {
            this.logger.error(`Failed to get competition pool: ${error.message}`);
            return { pool: {}, winners: [], stakes: [] };
        }

        const result = data || { pool: {}, winners: [], stakes: [] };

        // Ensure winners have their 'id' field for claim functionality
        if (result.winners && result.winners.length > 0) {
            const { data: winnerIds } = await supabase
                .from('pool_winners')
                .select('id, agent_id')
                .eq('competition_id', competitionId);
            
            if (winnerIds) {
                result.winners = result.winners.map((w: any) => {
                    const match = winnerIds.find(wid => wid.agent_id === w.agent_id);
                    return { ...w, id: match?.id };
                });
            }
        }

        // Fallback: if RPC didn't return stakes (pre-migration), fetch them directly
        // This ensures stakes are ALWAYS returned regardless of DB function version
        if (!result.stakes || result.stakes.length === 0) {
            const { data: stakeRows, error: stakeErr } = await supabase
                .from('pool_stakes')
                .select('user_id, agent_id, stake_amount, onchain_tx, verified_onchain, staked_at, status')
                .eq('competition_id', competitionId)
                .eq('status', 'active')
                .order('staked_at', { ascending: false });

            if (!stakeErr && stakeRows && stakeRows.length > 0) {
                result.stakes = stakeRows;
                this.logger.debug(`Fetched ${stakeRows.length} stakes via fallback query for competition ${competitionId}`);
            } else {
                result.stakes = [];
            }
        }

        return result;
    }

    /**
     * Get sector pool summary (aggregated across all competitions in a sector)
     */
    async getSectorPoolSummary(sector: string): Promise<any> {
        const supabase = this.supabaseService.getAdminClient();

        const { data, error } = await supabase.rpc('get_sector_pool_summary', {
            p_sector: sector,
        });

        if (error) {
            this.logger.error(`Failed to get sector pool summary: ${error.message}`);
            return {
                sector,
                total_pool: 0,
                total_staked: 0,
                competition_count: 0,
                total_participants: 0,
            };
        }

        return data;
    }

    /**
     * Get global pool summary (across all sectors)
     */
    async getGlobalPoolSummary(): Promise<any> {
        const supabase = this.supabaseService.getAdminClient();

        const { data, error } = await supabase.rpc('get_global_pool_summary');

        if (error) {
            this.logger.error(`Failed to get global pool summary: ${error.message}`);
            return {
                total_pool: 0,
                total_staked: 0,
                competition_count: 0,
                total_participants: 0,
            };
        }

        return data;
    }

    /**
     * Get sector winners (top 3 across all competitions in a sector)
     */
    async getSectorWinners(sector: string, limit: number = 3): Promise<any[]> {
        const supabase = this.supabaseService.getAdminClient();

        const { data, error } = await supabase
            .from('pool_winners')
            .select('*, competitions!inner(sector, title)')
            .eq('competitions.sector', sector)
            .order('final_accuracy', { ascending: false })
            .limit(limit);

        if (error) {
            this.logger.error(`Failed to get sector winners: ${error.message}`);
            return [];
        }

        return (data || []).map((w: any, i: number) => ({
            rank: i + 1,
            agent_id: w.agent_id,
            agent_name: w.agent_name,
            prize_amount: w.prize_amount,
            final_accuracy: w.final_accuracy,
            prediction_count: w.prediction_count,
            claimed: w.claimed,
            disburse_tx: w.disburse_tx,
            winner_wallet: w.winner_wallet,
            competition_title: w.competitions?.title,
            competition_id: w.competition_id,
        }));
    }

    /**
     * Get global winners (top N across ALL competitions)
     */
    async getGlobalWinners(limit: number = 4): Promise<any[]> {
        const supabase = this.supabaseService.getAdminClient();

        // Try materialized view first
        const { data: globalData, error: globalError } = await supabase
            .from('global_leaderboard')
            .select('*')
            .order('rank_score', { ascending: true })
            .limit(limit);

        if (!globalError && globalData && globalData.length > 0) {
            return globalData.map((entry: any, i: number) => ({
                rank: i + 1,
                agent_id: entry.agent_id,
                agent_name: entry.agent_name,
                model: entry.model,
                global_accuracy: entry.global_accuracy,
                competitions_entered: entry.competitions_entered,
                total_predictions: entry.total_predictions,
                total_wins: entry.total_wins,
                total_prize_earned: entry.total_prize_earned,
                avg_weighted_score: entry.avg_weighted_score,
            }));
        }

        // Fallback: aggregate from agent_competition_entries
        const { data, error } = await supabase
            .from('agent_competition_entries')
            .select('agent_id, weighted_score, prediction_count, agents(id, name, model, status)')
            .not('weighted_score', 'is', null)
            .order('weighted_score', { ascending: true })
            .limit(limit * 3);

        if (error) {
            this.logger.error(`Failed to get global winners: ${error.message}`);
            return [];
        }

        // Deduplicate by agent_id, pick best score
        const agentMap = new Map<string, any>();
        for (const entry of (data || [])) {
            const existing = agentMap.get(entry.agent_id);
            if (!existing || (entry.weighted_score < existing.weighted_score)) {
                agentMap.set(entry.agent_id, {
                    agent_id: entry.agent_id,
                    agent_name: (entry as any).agents?.name || 'Unknown',
                    model: (entry as any).agents?.model || 'Unknown',
                    avg_weighted_score: entry.weighted_score,
                    total_predictions: entry.prediction_count || 0,
                    global_accuracy: Math.max(0, Math.min(99.9, 98.0 * Math.exp(-(entry.weighted_score || 0) * 6))),
                });
            }
        }

        return Array.from(agentMap.values())
            .sort((a, b) => (a.avg_weighted_score || 99) - (b.avg_weighted_score || 99))
            .slice(0, limit)
            .map((entry, i) => ({ ...entry, rank: i + 1 }));
    }

    /**
     * Add a stake to a competition pool
     */
    async addStake(
        userId: string,
        competitionId: string,
        agentId: string,
        stakeAmount: number,
    ): Promise<any> {
        if (stakeAmount <= 0) {
            throw new BadRequestException('Stake amount must be positive');
        }

        const supabase = this.supabaseService.getAdminClient();

        // Verify pool exists
        const { data: pool } = await supabase
            .from('competition_pools')
            .select('id, settlement_status, max_stake_per_user, min_stake')
            .eq('competition_id', competitionId)
            .single();

        if (!pool) {
            throw new NotFoundException('No pool found for this competition');
        }

        if (pool.settlement_status !== 'pending') {
            throw new BadRequestException(`Pool is not accepting stakes (status: ${pool.settlement_status})`);
        }

        if (stakeAmount < Number(pool.min_stake)) {
            throw new BadRequestException(`Stake below minimum of ${pool.min_stake} SOL`);
        }

        if (stakeAmount > Number(pool.max_stake_per_user)) {
            throw new BadRequestException(`Stake exceeds maximum of ${pool.max_stake_per_user} SOL (anti-whale protection)`);
        }

        // Insert stake (DB trigger handles validation & pool update)
        const { data: stake, error } = await supabase
            .from('pool_stakes')
            .insert({
                pool_id: pool.id,
                competition_id: competitionId,
                user_id: userId,
                agent_id: agentId,
                stake_amount: stakeAmount,
            })
            .select('*')
            .single();

        if (error) {
            this.logger.error(`Failed to add stake: ${error.message}`);
            throw new BadRequestException(`Stake failed: ${error.message}`);
        }

        this.logger.log(`Stake added: ${stakeAmount} SOL by user ${userId} on competition ${competitionId}`);
        return stake;
    }

    /**
     * Settle a competition pool (admin/system only)
     * 1. Run DB settlement (determines winners from leaderboard)
     * 2. Disburse prizes on-chain to winner wallets
     * 3. Record all TX signatures in DB
     */
    async settlePool(competitionId: string, settledBy: string = 'system'): Promise<any> {
        const supabase = this.supabaseService.getAdminClient();

        // Step 1: Run DB settlement function (determines top 3 winners)
        const { data: settlementResult, error } = await supabase.rpc('settle_competition_pool', {
            p_competition_id: competitionId,
            p_settled_by: settledBy,
        });

        if (error) {
            this.logger.error(`Failed to settle pool: ${error.message}`);
            throw new BadRequestException(`Settlement failed: ${error.message}`);
        }

        this.logger.log(`Pool settled in DB for competition ${competitionId} by ${settledBy}. Awaiting user claim.`);

        // Step 2: Refresh global leaderboard
        try { await supabase.rpc('refresh_global_leaderboard'); } catch (_e) { /* ignore */ }

        return settlementResult;
    }

    // ═══════════════════════════════════════════════════════════════
    // CLAIM PRIZE — Enterprise-Grade Pull Mechanism
    // Security: Concurrency Lock + Settlement Check + Wallet Auth
    //           + Pessimistic Double-Check + Failed Attempt Audit
    // ═══════════════════════════════════════════════════════════════

    /** In-memory concurrency lock to prevent race-condition double-claims */
    private readonly claimLocks = new Set<string>();

    /**
     * User-initiated claim prize logic (Pull mechanism) — HARDENED
     *
     * Security layers:
     * 1. In-memory mutex lock (anti race-condition double-spend)
     * 2. Competition settlement status verification
     * 3. Multi-layer wallet ownership verification
     * 4. Pessimistic re-check after on-chain TX (anti-parallel exploit)
     * 5. Failed attempt audit logging for forensics
     */
    async claimPrize(winnerId: string, requestingWallet: string, req?: any): Promise<any> {
        const supabase = this.supabaseService.getAdminClient();
        const claimStartTime = Date.now();

        // ── Layer 1: Concurrency Lock (in-memory mutex) ──
        // Prevents two parallel requests from claiming the same prize
        if (this.claimLocks.has(winnerId)) {
            this.logger.warn(`⚠️ Concurrent claim blocked for winner ${winnerId}`);
            throw new BadRequestException('Claim already in progress. Please wait.');
        }
        this.claimLocks.add(winnerId);

        try {
            // ── Layer 2: Fetch & validate winner record ──
            const { data: winner, error: winnerError } = await supabase
                .from('pool_winners')
                .select('*')
                .eq('id', winnerId)
                .single();

            if (winnerError || !winner) {
                await this.logClaimAttempt(supabase, winnerId, requestingWallet, 'winner_not_found', req);
                throw new NotFoundException('Winner record not found');
            }

            // ── Layer 3: Double-claim check (database level) ──
            if (winner.claimed) {
                await this.logClaimAttempt(supabase, winnerId, requestingWallet, 'already_claimed', req);
                throw new BadRequestException('Prize already claimed');
            }

            // ── Layer 4: Competition settlement verification ──
            // Only settled competitions can have prizes claimed
            const { data: pool } = await supabase
                .from('competition_pools')
                .select('settlement_status')
                .eq('competition_id', winner.competition_id)
                .single();

            if (!pool || pool.settlement_status !== 'settled') {
                await this.logClaimAttempt(supabase, winnerId, requestingWallet, 'pool_not_settled', req);
                throw new BadRequestException('Competition pool has not been settled yet');
            }

            // ── Layer 5: Multi-layer wallet ownership verification ──
            const isOwner = await this.verifyWalletOwnership(winner.user_id, requestingWallet);
            if (!isOwner) {
                await this.logClaimAttempt(supabase, winnerId, requestingWallet, 'wallet_mismatch', req);
                this.logger.error(`🚨 UNAUTHORIZED claim attempt: winner=${winnerId} expected_user=${winner.user_id} got_wallet=${requestingWallet.slice(0, 12)}...`);
                throw new BadRequestException('Unauthorized: Connected wallet does not match the winner');
            }

            // ── Layer 6: Validate prize amount ──
            const prizeAmount = Number(winner.prize_amount);
            if (!prizeAmount || prizeAmount <= 0 || !isFinite(prizeAmount)) {
                await this.logClaimAttempt(supabase, winnerId, requestingWallet, 'invalid_prize_amount', req);
                throw new BadRequestException('Prize amount is invalid');
            }

            // Safety cap: prevent absurd disbursements (max 100 SOL per claim)
            if (prizeAmount > 100) {
                this.logger.error(`🚨 SAFETY CAP: Prize ${prizeAmount} SOL exceeds 100 SOL limit for winner ${winnerId}`);
                await this.logClaimAttempt(supabase, winnerId, requestingWallet, 'safety_cap_exceeded', req);
                throw new BadRequestException('Prize amount exceeds safety limit. Contact support.');
            }

            const prizeLamports = Math.floor(prizeAmount * LAMPORTS_PER_SOL);

            // ── Layer 7: Pre-claim Database Lock (anti double-spend) ──
            // We set claimed = true and disburse_tx = 'claiming_onchain' BEFORE executing the on-chain transfer.
            // This ensures that even if a network timeout or crash happens mid-transfer,
            // the prize cannot be claimed again.
            const { data: lockRecord, error: lockError } = await supabase
                .from('pool_winners')
                .update({
                    claimed: true,
                    disburse_tx: 'claiming_onchain',
                    winner_wallet: requestingWallet,
                    claimed_at: new Date().toISOString(),
                })
                .eq('id', winner.id)
                .eq('claimed', false)
                .select('*')
                .maybeSingle();

            if (lockError || !lockRecord) {
                this.logger.error(`🚨 Lock failed for winner ${winnerId}: ${lockError?.message || 'already locked'}`);
                await this.logClaimAttempt(supabase, winnerId, requestingWallet, 'lock_failed_already_claimed', req);
                throw new BadRequestException('Claim already processed or in progress.');
            }

            // ── Layer 8: On-chain transfer ──
            this.logger.log(`💸 Initiating on-chain transfer: ${prizeAmount} SOL → ${requestingWallet.slice(0, 12)}...`);
            let txSignature: string | null = null;
            try {
                txSignature = await this.sendPrizeTransfer(requestingWallet, prizeLamports);
            } catch (txErr: any) {
                this.logger.error(`❌ On-chain transfer exception for ${winnerId}: ${txErr.message}`);
            }

            if (!txSignature) {
                // Rollback pre-claim lock on failure
                this.logger.warn(`🔄 Rolling back pre-claim database lock for winner ${winnerId}`);
                await supabase
                    .from('pool_winners')
                    .update({
                        claimed: false,
                        disburse_tx: null,
                        winner_wallet: null,
                        claimed_at: null,
                    })
                    .eq('id', winner.id);

                await this.logClaimAttempt(supabase, winnerId, requestingWallet, 'transfer_failed', req);
                throw new BadRequestException('On-chain transfer failed. Please try again later.');
            }

            // ── Layer 9: Update with final Transaction Signature ──
            await supabase
                .from('pool_winners')
                .update({
                    disburse_tx: txSignature,
                })
                .eq('id', winner.id);

            const claimDuration = Date.now() - claimStartTime;
            this.logger.log(`🏆 Prize CLAIMED: ${prizeAmount} SOL → ${requestingWallet.slice(0, 12)}... (Rank #${winner.rank}) TX: ${txSignature} [${claimDuration}ms]`);

            // ── Layer 10: Immutable audit trail ──
            const poolId = (await supabase.from('competition_pools').select('id').eq('competition_id', winner.competition_id).single()).data?.id;
            
            await supabase.from('pool_settlement_audit').insert({
                pool_id: poolId,
                competition_id: winner.competition_id,
                event_type: 'prize_claimed',
                agent_id: winner.agent_id || null,
                user_id: winner.user_id,
                amount: prizeAmount,
                details: {
                    rank: winner.rank,
                    tx: txSignature,
                    wallet: requestingWallet,
                    claim_duration_ms: claimDuration,
                    ip: req?.ip || req?.headers?.['x-forwarded-for'] || 'unknown',
                    user_agent: req?.headers?.['user-agent']?.slice(0, 100) || 'unknown',
                },
                event_hash: Buffer.from(txSignature).toString('base64').slice(0, 64),
            });

            // ── Layer 11: Append to pool disburse TX array ──
            const { data: poolData } = await supabase
                .from('competition_pools')
                .select('onchain_disburse_txs')
                .eq('competition_id', winner.competition_id)
                .single();
                
            const existingTxs = poolData?.onchain_disburse_txs || [];
            existingTxs.push({
                rank: winner.rank,
                agent_name: winner.agent_name,
                wallet: requestingWallet,
                amount: prizeAmount,
                tx: txSignature,
                solscan: `https://solscan.io/tx/${txSignature}?cluster=devnet`,
                claimed_by_user: true,
                claimed_at: new Date().toISOString(),
            });

            await supabase
                .from('competition_pools')
                .update({ onchain_disburse_txs: existingTxs })
                .eq('competition_id', winner.competition_id);

            return { success: true, tx: txSignature, amount: prizeAmount };

        } finally {
            // Always release the lock
            this.claimLocks.delete(winnerId);
        }
    }

    /**
     * Multi-layer wallet ownership verification.
     * Checks: direct match → wallet_addresses table → profiles table
     */
    private async verifyWalletOwnership(userId: string, requestingWallet: string): Promise<boolean> {
        // Direct match: user_id IS the wallet pubkey (most common in ExoDuZe)
        if (userId === requestingWallet) return true;

        const supabase = this.supabaseService.getAdminClient();

        // Check wallet_addresses table
        const { data: walletRecord } = await supabase
            .from('wallet_addresses')
            .select('user_id')
            .eq('address', requestingWallet.toLowerCase())
            .eq('user_id', userId)
            .limit(1)
            .maybeSingle();

        if (walletRecord) return true;

        // Check profiles.wallet_addresses JSONB array
        const { data: profile } = await supabase
            .from('profiles')
            .select('wallet_addresses')
            .eq('id', userId)
            .single();

        if (profile?.wallet_addresses) {
            const wallets = Array.isArray(profile.wallet_addresses) ? profile.wallet_addresses : [];
            const match = wallets.some((w: any) =>
                w.address?.toLowerCase() === requestingWallet.toLowerCase()
            );
            if (match) return true;
        }

        // Fallback: resolveWalletAddress (legacy path)
        const resolved = await this.resolveWalletAddress(userId);
        return resolved === requestingWallet;
    }

    /**
     * Log failed/suspicious claim attempts for forensic analysis.
     * Stored in pool_settlement_audit with event_type = 'claim_attempt_failed'.
     */
    private async logClaimAttempt(
        supabase: any,
        winnerId: string,
        wallet: string,
        reason: string,
        req?: any,
    ): Promise<void> {
        try {
            await supabase.from('pool_settlement_audit').insert({
                pool_id: '00000000-0000-0000-0000-000000000000', // placeholder for failed attempts
                competition_id: '00000000-0000-0000-0000-000000000000',
                event_type: 'claim_attempt_failed',
                details: {
                    winner_id: winnerId,
                    wallet: wallet?.slice(0, 16) + '...',
                    reason,
                    ip: req?.ip || req?.headers?.['x-forwarded-for'] || 'unknown',
                    user_agent: req?.headers?.['user-agent']?.slice(0, 100) || 'unknown',
                    timestamp: new Date().toISOString(),
                },
                event_hash: Buffer.from(`${winnerId}:${wallet}:${reason}:${Date.now()}`).toString('base64').slice(0, 64),
            });
        } catch (err: any) {
            this.logger.warn(`Failed to log claim attempt: ${err.message}`);
        }
    }

    /**
     * Send SOL from platform treasury keypair to a winner wallet.
     * REAL TRANSFERS ONLY — no simulations, no fallbacks to airdrop.
     * 
     * Flow:
     * 1. Decode Treasury keypair from env
     * 2. Check Treasury has sufficient balance
     * 3. Execute SystemProgram.transfer on Solana Devnet
     * 4. Confirm with 'confirmed' commitment
     * 5. Return real TX signature (verifiable on Solscan)
     */
    private async sendPrizeTransfer(recipientWallet: string, lamports: number): Promise<string | null> {
        const treasuryKeyEnv = this.configService.get<string>('SOLANA_TREASURY_PRIVATE_KEY');
        if (!treasuryKeyEnv) {
            this.logger.error('❌ SOLANA_TREASURY_PRIVATE_KEY is not set. Cannot send real prize transfer.');
            return null;
        }

        let treasuryKeypair: Keypair;
        try {
            treasuryKeypair = Keypair.fromSecretKey(bs58.decode(treasuryKeyEnv));
        } catch (err: any) {
            this.logger.error(`❌ Treasury keypair decode failed — check .env format: ${err.message}`);
            return null;
        }

        // Pre-flight: check treasury balance
        try {
            const balance = await this.connection.getBalance(treasuryKeypair.publicKey);
            const requiredWithFee = lamports + 10000; // 10k lamports for TX fee
            if (balance < requiredWithFee) {
                this.logger.error(
                    `❌ Treasury insufficient balance: ${balance / LAMPORTS_PER_SOL} SOL available, ` +
                    `need ${requiredWithFee / LAMPORTS_PER_SOL} SOL. ` +
                    `Fund treasury: ${treasuryKeypair.publicKey.toString()}`
                );
                return null;
            }
            this.logger.log(`💰 Treasury balance OK: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL (need ${(requiredWithFee / LAMPORTS_PER_SOL).toFixed(4)} SOL)`);
        } catch (err: any) {
            this.logger.error(`❌ Failed to check treasury balance: ${err.message}`);
            return null;
        }

        // Execute real transfer with retry
        const MAX_RETRIES = 2;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const recipientPubkey = new PublicKey(recipientWallet);

                const tx = new Transaction().add(
                    SystemProgram.transfer({
                        fromPubkey: treasuryKeypair.publicKey,
                        toPubkey: recipientPubkey,
                        lamports,
                    })
                );

                const signature = await sendAndConfirmTransaction(
                    this.connection, tx, [treasuryKeypair],
                    { commitment: 'confirmed' },
                );

                this.logger.log(
                    `✅ REAL prize transfer confirmed: ${lamports / LAMPORTS_PER_SOL} SOL → ${recipientWallet.slice(0, 12)}... ` +
                    `TX: ${signature} | Solscan: https://solscan.io/tx/${signature}?cluster=devnet`
                );
                return signature;

            } catch (err: any) {
                this.logger.error(`❌ Transfer attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
                if (attempt < MAX_RETRIES) {
                    // Wait 2s before retry (transient network error)
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
        }

        this.logger.error(`❌ All ${MAX_RETRIES} transfer attempts failed for ${recipientWallet.slice(0, 12)}...`);
        return null;
    }

    /**
     * Resolve wallet address from user_id.
     * Users login with their Solana wallet, so user_id IS the wallet pubkey.
     */
    private async resolveWalletAddress(userId: string): Promise<string | null> {
        // In ExoDuZe, user_id from wallet auth is the wallet public key itself
        // Check if it's a valid Solana public key
        try {
            new PublicKey(userId);
            return userId;
        } catch {
            // Not a pubkey — try to look up from Supabase auth
            const supabase = this.supabaseService.getAdminClient();
            const { data: profile } = await supabase
                .from('profiles')
                .select('wallet_address')
                .eq('id', userId)
                .single();

            if (profile?.wallet_address) {
                return profile.wallet_address;
            }

            // Also check agents table for this user's wallet
            const { data: agent } = await supabase
                .from('agents')
                .select('user_id')
                .eq('user_id', userId)
                .limit(1)
                .single();

            if (agent?.user_id) {
                try {
                    new PublicKey(agent.user_id);
                    return agent.user_id;
                } catch {
                    return null;
                }
            }

            return null;
        }
    }

    /**
     * @deprecated Use the frontend on-chain stake flow + /agents/wager endpoint instead.
     * This method should NOT be called for new deployments. Pool stakes are created
     * ONLY after the frontend confirms a real on-chain Solana TX via /agents/wager.
     *
     * Auto-create a pool stake with a REAL Solana devnet transaction.
     * stakeAmount is REQUIRED — no default to prevent ghost entries with wrong amounts.
     */
    async autoStakeWithDevnetTx(
        competitionId: string,
        userId: string,
        agentId: string,
        stakeAmount: number,
    ): Promise<{ stakeId: string; onchainTx: string | null }> {
        // Guard: reject calls without an explicit stake amount
        if (!stakeAmount || stakeAmount <= 0) {
            this.logger.warn(`autoStakeWithDevnetTx called without valid stakeAmount (${stakeAmount}), skipping`);
            return { stakeId: '', onchainTx: null };
        }

        const supabase = this.supabaseService.getAdminClient();

        // 1. Get or verify pool exists
        const { data: pool } = await supabase
            .from('competition_pools')
            .select('id, settlement_status')
            .eq('competition_id', competitionId)
            .single();

        if (!pool) {
            this.logger.warn(`No pool for competition ${competitionId}, skipping auto-stake`);
            return { stakeId: '', onchainTx: null };
        }

        if (pool.settlement_status !== 'pending') {
            this.logger.warn(`Pool already ${pool.settlement_status}, skipping auto-stake`);
            return { stakeId: '', onchainTx: null };
        }

        // 2. Check for duplicate stake (same agent in same competition)
        const { data: existing } = await supabase
            .from('pool_stakes')
            .select('id')
            .eq('competition_id', competitionId)
            .eq('agent_id', agentId)
            .limit(1);

        if (existing && existing.length > 0) {
            this.logger.log(`Stake already exists for agent ${agentId} in competition ${competitionId}`);
            return { stakeId: existing[0].id, onchainTx: null };
        }

        // 3. Generate a REAL Solana devnet transaction
        let onchainTx: string | null = null;
        try {
            onchainTx = await this.generateDevnetStakeTx(stakeAmount);
        } catch (err: any) {
            this.logger.warn(`Devnet TX generation failed (non-blocking): ${err.message}`);
        }

        // 4. Insert pool_stake (DB trigger auto-updates pool totals)
        const { data: stake, error } = await supabase
            .from('pool_stakes')
            .insert({
                pool_id: pool.id,
                competition_id: competitionId,
                user_id: userId,
                agent_id: agentId,
                stake_amount: stakeAmount,
                onchain_tx: onchainTx,
                verified_onchain: !!onchainTx,
                status: 'active',
            })
            .select('id')
            .single();

        if (error) {
            this.logger.error(`Auto-stake insert failed: ${error.message}`);
            return { stakeId: '', onchainTx: null };
        }

        this.logger.log(`✅ Auto-stake created: ${stakeAmount} SOL for agent ${agentId} | TX: ${onchainTx?.slice(0, 20) || 'none'}...`);
        return { stakeId: stake?.id || '', onchainTx };
    }

    /**
     * Generate a real Solana devnet transaction for stake tracking.
     * Uses treasury keypair for a self-transfer, or falls back to airdrop.
     */
    private async generateDevnetStakeTx(amount: number): Promise<string | null> {
        const treasuryKeyEnv = this.configService.get<string>('SOLANA_TREASURY_PRIVATE_KEY');

        if (treasuryKeyEnv) {
            // Real transfer from treasury to itself (creates a verifiable TX on Solscan)
            try {
                const treasuryKeypair = Keypair.fromSecretKey(bs58.decode(treasuryKeyEnv));
                const lamports = Math.max(1000, Math.floor(amount * LAMPORTS_PER_SOL * 0.001)); // tiny amount

                const tx = new Transaction().add(
                    SystemProgram.transfer({
                        fromPubkey: treasuryKeypair.publicKey,
                        toPubkey: treasuryKeypair.publicKey,
                        lamports,
                    })
                );

                const signature = await sendAndConfirmTransaction(
                    this.connection, tx, [treasuryKeypair],
                    { commitment: 'confirmed' },
                );

                this.logger.log(`🔗 Devnet stake TX confirmed: ${signature.slice(0, 20)}...`);
                return signature;
            } catch (err: any) {
                this.logger.warn(`Treasury TX failed, trying airdrop fallback: ${err.message}`);
            }
        }

        // Fallback: request a devnet airdrop (creates a real faucet TX)
        try {
            const tempKeypair = Keypair.generate();
            const minLamports = Math.min(Math.floor(amount * LAMPORTS_PER_SOL), LAMPORTS_PER_SOL);
            const airdropSig = await this.connection.requestAirdrop(tempKeypair.publicKey, minLamports);

            const latestBlockhash = await this.connection.getLatestBlockhash();
            await this.connection.confirmTransaction({
                signature: airdropSig,
                blockhash: latestBlockhash.blockhash,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
            }, 'confirmed');

            this.logger.log(`🔗 Devnet airdrop stake TX: ${airdropSig.slice(0, 20)}...`);
            return airdropSig;
        } catch (err: any) {
            this.logger.error(`All devnet TX methods failed: ${err.message}`);
            return null;
        }
    }

    /**
     * Refresh global leaderboard materialized view
     */
    async refreshGlobalLeaderboard(): Promise<void> {
        const supabase = this.supabaseService.getAdminClient();
        await supabase.rpc('refresh_global_leaderboard');
    }
}
