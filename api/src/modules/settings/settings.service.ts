import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
    ConflictException,
} from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { SupabaseService } from '../../database/supabase.service.js';
import {
    UserSettingsDto,
    UpdateUserSettingsDto,
    ApiKeyDto,
    ApiKeyCreatedDto,
    CreateApiKeyDto,
    WhitelistAddressDto,
    AddWhitelistAddressDto,
    SocialConnectionDto,
    ConnectSocialDto,
    Theme,
    Currency,
} from './dto/index.js';

/**
 * SettingsService
 * 
 * Manages user settings:
 * - Display preferences
 * - Trading preferences
 * - API key management
 * - Withdrawal whitelist
 * - Social connections
 */
@Injectable()
export class SettingsService {
    private readonly logger = new Logger(SettingsService.name);

    constructor(private readonly supabaseService: SupabaseService) { }

    // ========================================================================
    // USER SETTINGS
    // ========================================================================

    /**
     * Get user settings
     */
    async getSettings(userId: string): Promise<UserSettingsDto> {
        const { data, error } = await this.supabaseService
            .getAdminClient()
            .from('user_settings')
            .select('*')
            .eq('user_id', userId)
            .single();

        // Return defaults if no settings exist
        if (error || !data) {
            return {
                theme: Theme.DARK,
                displayCurrency: Currency.USD,
                defaultSlippage: 0.5,
                gasPreference: 'medium',
                showPortfolioValues: true,
                allowAnalytics: true,
                timezone: 'UTC',
                language: 'en',
            };
        }

        return {
            theme: data.theme || Theme.DARK,
            displayCurrency: data.display_currency || Currency.USD,
            defaultSlippage: parseFloat(data.default_slippage) || 0.5,
            gasPreference: data.gas_preference || 'medium',
            showPortfolioValues: data.show_portfolio_values ?? true,
            allowAnalytics: data.allow_analytics ?? true,
            timezone: data.timezone || 'UTC',
            language: data.language || 'en',
        };
    }

    /**
     * Update user settings
     */
    async updateSettings(userId: string, dto: UpdateUserSettingsDto): Promise<UserSettingsDto> {
        const updateData: any = {};

        if (dto.theme !== undefined) updateData.theme = dto.theme;
        if (dto.displayCurrency !== undefined) updateData.display_currency = dto.displayCurrency;
        if (dto.defaultSlippage !== undefined) updateData.default_slippage = dto.defaultSlippage;
        if (dto.gasPreference !== undefined) updateData.gas_preference = dto.gasPreference;
        if (dto.showPortfolioValues !== undefined) updateData.show_portfolio_values = dto.showPortfolioValues;
        if (dto.allowAnalytics !== undefined) updateData.allow_analytics = dto.allowAnalytics;
        if (dto.timezone !== undefined) updateData.timezone = dto.timezone;
        if (dto.language !== undefined) updateData.language = dto.language;

        updateData.updated_at = new Date().toISOString();

        const { error } = await this.supabaseService
            .getAdminClient()
            .from('user_settings')
            .upsert({
                user_id: userId,
                ...updateData,
            }, {
                onConflict: 'user_id',
            });

        if (error) {
            this.logger.error(`Failed to update settings: ${error.message}`);
            throw new BadRequestException('Failed to update settings');
        }

        return this.getSettings(userId);
    }

    // ========================================================================
    // API KEYS
    // ========================================================================

    /**
     * List user's API keys
     */
    async getApiKeys(userId: string): Promise<ApiKeyDto[]> {
        const { data, error } = await this.supabaseService
            .getAdminClient()
            .from('user_api_keys')
            .select('id, name, key_prefix, permissions, last_used_at, expires_at, created_at')
            .eq('user_id', userId)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) {
            this.logger.error(`Failed to fetch API keys: ${error.message}`);
            return [];
        }

        return (data || []).map(k => ({
            id: k.id,
            name: k.name,
            keyPrefix: k.key_prefix,
            permissions: k.permissions || [],
            lastUsedAt: k.last_used_at,
            expiresAt: k.expires_at,
            createdAt: k.created_at,
        }));
    }

    /**
     * Create a new API key
     */
    async createApiKey(userId: string, dto: CreateApiKeyDto): Promise<ApiKeyCreatedDto> {
        // Check if user has too many keys
        const { count } = await this.supabaseService
            .getAdminClient()
            .from('user_api_keys')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_active', true);

        if ((count || 0) >= 10) {
            throw new BadRequestException('Maximum 10 API keys allowed');
        }

        // Generate secure API key
        const rawKey = randomBytes(32).toString('hex');
        const keyPrefix = rawKey.substring(0, 8);
        const keyHash = createHash('sha256').update(rawKey).digest('hex');

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + (dto.expiresInDays || 365));

        const { data, error } = await this.supabaseService
            .getAdminClient()
            .from('user_api_keys')
            .insert({
                user_id: userId,
                name: dto.name,
                key_hash: keyHash,
                key_prefix: keyPrefix,
                permissions: dto.permissions || ['read'],
                expires_at: expiresAt.toISOString(),
            })
            .select('id, name, key_prefix, permissions, expires_at, created_at')
            .single();

        if (error) {
            this.logger.error(`Failed to create API key: ${error.message}`);
            throw new BadRequestException('Failed to create API key');
        }

        return {
            id: data.id,
            name: data.name,
            keyPrefix: data.key_prefix,
            permissions: data.permissions,
            lastUsedAt: null,
            expiresAt: data.expires_at,
            createdAt: data.created_at,
            apiKey: `dv_${rawKey}`, // Full key - only returned once
        };
    }

    /**
     * Revoke an API key
     */
    async revokeApiKey(userId: string, keyId: string): Promise<{ success: boolean }> {
        const { error } = await this.supabaseService
            .getAdminClient()
            .from('user_api_keys')
            .update({ is_active: false, revoked_at: new Date().toISOString() })
            .eq('id', keyId)
            .eq('user_id', userId);

        if (error) {
            this.logger.error(`Failed to revoke API key: ${error.message}`);
            throw new NotFoundException('API key not found');
        }

        return { success: true };
    }

    // ========================================================================
    // WITHDRAWAL WHITELIST
    // ========================================================================

    /**
     * Get withdrawal whitelist addresses
     */
    async getWhitelist(userId: string): Promise<WhitelistAddressDto[]> {
        const { data, error } = await this.supabaseService
            .getAdminClient()
            .from('withdrawal_whitelist')
            .select('*')
            .eq('user_id', userId)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) {
            this.logger.error(`Failed to fetch whitelist: ${error.message}`);
            return [];
        }

        return (data || []).map(w => ({
            id: w.id,
            address: w.address,
            chain: w.chain,
            label: w.label,
            isVerified: w.is_verified,
            createdAt: w.created_at,
        }));
    }

    /**
     * Add address to whitelist
     */
    async addWhitelistAddress(
        userId: string,
        dto: AddWhitelistAddressDto,
    ): Promise<WhitelistAddressDto> {
        // Check for duplicates
        const { data: existing } = await this.supabaseService
            .getAdminClient()
            .from('withdrawal_whitelist')
            .select('id')
            .eq('user_id', userId)
            .eq('address', dto.address)
            .eq('chain', dto.chain)
            .eq('is_active', true)
            .single();

        if (existing) {
            throw new ConflictException('Address already in whitelist');
        }

        const { data, error } = await this.supabaseService
            .getAdminClient()
            .from('withdrawal_whitelist')
            .insert({
                user_id: userId,
                address: dto.address,
                chain: dto.chain,
                label: dto.label,
                is_verified: false, // Requires verification period
            })
            .select()
            .single();

        if (error) {
            this.logger.error(`Failed to add whitelist address: ${error.message}`);
            throw new BadRequestException('Failed to add address');
        }

        return {
            id: data.id,
            address: data.address,
            chain: data.chain,
            label: data.label,
            isVerified: data.is_verified,
            createdAt: data.created_at,
        };
    }

    /**
     * Remove address from whitelist
     */
    async removeWhitelistAddress(userId: string, addressId: string): Promise<{ success: boolean }> {
        const { error } = await this.supabaseService
            .getAdminClient()
            .from('withdrawal_whitelist')
            .update({ is_active: false })
            .eq('id', addressId)
            .eq('user_id', userId);

        if (error) {
            this.logger.error(`Failed to remove whitelist address: ${error.message}`);
            throw new NotFoundException('Address not found');
        }

        return { success: true };
    }

    // ========================================================================
    // SOCIAL CONNECTIONS
    // ========================================================================

    /**
     * Get social connections
     */
    async getSocialConnections(userId: string): Promise<SocialConnectionDto[]> {
        const { data, error } = await this.supabaseService
            .getAdminClient()
            .from('user_social_connections')
            .select('*')
            .eq('user_id', userId)
            .eq('is_active', true);

        if (error) {
            this.logger.error(`Failed to fetch social connections: ${error.message}`);
            return [];
        }

        return (data || []).map(s => ({
            id: s.id,
            provider: s.provider,
            username: s.username,
            profileUrl: s.profile_url,
            connectedAt: s.created_at,
        }));
    }

    /**
     * Disconnect a social account
     */
    async disconnectSocial(userId: string, connectionId: string): Promise<{ success: boolean }> {
        const { error } = await this.supabaseService
            .getAdminClient()
            .from('user_social_connections')
            .update({ is_active: false })
            .eq('id', connectionId)
            .eq('user_id', userId);

        if (error) {
            this.logger.error(`Failed to disconnect social: ${error.message}`);
            throw new NotFoundException('Connection not found');
        }

        return { success: true };
    }
}
