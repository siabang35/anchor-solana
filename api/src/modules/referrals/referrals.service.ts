import {
    Injectable,
    Logger,
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service.js';
import {
    ReferralCodeDto,
    ReferralStatsDto,
    CreateReferralCodeDto,
    ApplyReferralCodeDto,
    ReferralRewardDto,
} from './dto/index.js';

/**
 * ReferralsService
 * 
 * Manages builder/referral codes:
 * - Create referral codes
 * - Apply referral codes
 * - Track referrals and earnings
 * - Claim rewards
 */
@Injectable()
export class ReferralsService {
    private readonly logger = new Logger(ReferralsService.name);

    constructor(private readonly supabaseService: SupabaseService) { }

    /**
     * Get user's referral code and basic stats
     */
    async getReferralCode(userId: string): Promise<ReferralCodeDto | null> {
        const { data, error } = await this.supabaseService
            .getAdminClient()
            .from('referral_codes')
            .select('*')
            .eq('user_id', userId)
            .eq('is_active', true)
            .single();

        if (error || !data) {
            return null;
        }

        return {
            code: data.code,
            totalReferrals: data.total_referrals || 0,
            activeReferrals: data.active_referrals || 0,
            totalEarnings: parseFloat(data.total_earnings) || 0,
            pendingEarnings: parseFloat(data.pending_earnings) || 0,
            createdAt: data.created_at,
        };
    }

    /**
     * Create a new referral code
     */
    async createReferralCode(userId: string, dto: CreateReferralCodeDto): Promise<ReferralCodeDto> {
        // Check if user already has a code
        const existing = await this.getReferralCode(userId);
        if (existing) {
            throw new ConflictException('You already have a referral code');
        }

        // Generate or use custom code
        const code = dto.customCode || this.generateCode();

        // Check if code is taken
        const { data: taken } = await this.supabaseService
            .getAdminClient()
            .from('referral_codes')
            .select('id')
            .eq('code', code)
            .single();

        if (taken) {
            throw new ConflictException('This code is already taken');
        }

        const { data, error } = await this.supabaseService
            .getAdminClient()
            .from('referral_codes')
            .insert({
                user_id: userId,
                code: code.toUpperCase(),
            })
            .select()
            .single();

        if (error) {
            this.logger.error(`Failed to create referral code: ${error.message}`);
            throw new BadRequestException('Failed to create referral code');
        }

        return {
            code: data.code,
            totalReferrals: 0,
            activeReferrals: 0,
            totalEarnings: 0,
            pendingEarnings: 0,
            createdAt: data.created_at,
        };
    }

    /**
     * Apply a referral code (for new users)
     */
    async applyReferralCode(userId: string, dto: ApplyReferralCodeDto): Promise<{ success: boolean }> {
        // Check if user already has a referrer
        const { data: existingTracking } = await this.supabaseService
            .getAdminClient()
            .from('referral_tracking')
            .select('id')
            .eq('referred_user_id', userId)
            .single();

        if (existingTracking) {
            throw new ConflictException('You have already applied a referral code');
        }

        // Find the referral code
        const { data: referralCode, error: codeError } = await this.supabaseService
            .getAdminClient()
            .from('referral_codes')
            .select('id, user_id')
            .eq('code', dto.code.toUpperCase())
            .eq('is_active', true)
            .single();

        if (codeError || !referralCode) {
            throw new NotFoundException('Invalid referral code');
        }

        // Prevent self-referral
        if (referralCode.user_id === userId) {
            throw new BadRequestException('You cannot use your own referral code');
        }

        // Create tracking record
        const { error: trackingError } = await this.supabaseService
            .getAdminClient()
            .from('referral_tracking')
            .insert({
                referral_code_id: referralCode.id,
                referrer_user_id: referralCode.user_id,
                referred_user_id: userId,
            });

        if (trackingError) {
            this.logger.error(`Failed to apply referral: ${trackingError.message}`);
            throw new BadRequestException('Failed to apply referral code');
        }

        // Update referral code stats
        await this.supabaseService
            .getAdminClient()
            .from('referral_codes')
            .update({
                total_referrals: (await this.getCodeStats(referralCode.id)).totalReferrals + 1,
            })
            .eq('id', referralCode.id);

        return { success: true };
    }

    /**
     * Get detailed referral statistics
     */
    async getReferralStats(userId: string): Promise<ReferralStatsDto | null> {
        const code = await this.getReferralCode(userId);
        if (!code) {
            return null;
        }

        // Get recent referrals
        const { data: referrals } = await this.supabaseService
            .getAdminClient()
            .from('referral_tracking')
            .select(`
                id,
                referred_user:profiles!referred_user_id (email),
                created_at,
                trading_volume,
                total_rewards_generated
            `)
            .eq('referrer_user_id', userId)
            .order('created_at', { ascending: false })
            .limit(10);

        return {
            ...code,
            tier: this.calculateTier(code.totalReferrals),
            commissionRate: this.getCommissionRate(code.totalReferrals),
            recentReferrals: (referrals || []).map((r: any) => ({
                id: r.id,
                email: this.maskEmail(r.referred_user?.email || ''),
                signupDate: r.created_at,
                tradingVolume: parseFloat(r.trading_volume) || 0,
                earnings: parseFloat(r.total_rewards_generated) || 0,
            })),
        };
    }

    /**
     * Get pending rewards
     */
    async getPendingRewards(userId: string): Promise<ReferralRewardDto[]> {
        const { data, error } = await this.supabaseService
            .getAdminClient()
            .from('referral_rewards')
            .select('*')
            .eq('referrer_user_id', userId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error) {
            this.logger.error(`Failed to fetch rewards: ${error.message}`);
            return [];
        }

        return (data || []).map(r => ({
            id: r.id,
            amount: parseFloat(r.amount),
            currency: r.currency,
            status: r.status,
            referredUserId: r.referred_user_id,
            createdAt: r.created_at,
        }));
    }

    // ========================================================================
    // HELPER METHODS
    // ========================================================================

    private generateCode(): string {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 for clarity
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    private async getCodeStats(codeId: string): Promise<{ totalReferrals: number }> {
        const { count } = await this.supabaseService
            .getAdminClient()
            .from('referral_tracking')
            .select('*', { count: 'exact', head: true })
            .eq('referral_code_id', codeId);

        return { totalReferrals: count || 0 };
    }

    private calculateTier(totalReferrals: number): number {
        if (totalReferrals >= 100) return 4;
        if (totalReferrals >= 50) return 3;
        if (totalReferrals >= 10) return 2;
        return 1;
    }

    private getCommissionRate(totalReferrals: number): number {
        const tier = this.calculateTier(totalReferrals);
        const rates = { 1: 0.1, 2: 0.15, 3: 0.2, 4: 0.25 };
        return rates[tier] || 0.1;
    }

    private maskEmail(email: string): string {
        if (!email || !email.includes('@')) return '***';
        const [local, domain] = email.split('@');
        const masked = local.substring(0, 2) + '***';
        return `${masked}@${domain}`;
    }
}
