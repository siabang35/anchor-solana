import {
    Controller,
    Get,
    Post,
    Body,
    Query,
    UseGuards,
    HttpCode,
    HttpStatus,
    Logger,
    Param,
    Req,
    BadRequestException,
} from '@nestjs/common';

import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiBody,
    ApiParam,
    ApiHeader,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { DepositService } from './deposit.service.js';
import { PrivyService } from './services/privy.service.js';
import { DepositAuditService, AuditEventType } from './services/deposit-audit.service.js';
import { PrivyAuthGuard, RequirePrivy } from './guards/privy-auth.guard.js';
import { RateLimit, RateLimits } from '../security/decorators/rate-limit.decorator.js';
import { RateLimitGuard } from '../security/guards/security.guard.js';
import {
    InitiateDepositDto,
    VerifyDepositDto,
    DepositHistoryQueryDto,
    BalanceResponseDto,
    InitiateDepositResponseDto,
    DepositTransactionDto,
    DepositChain,
    InitiateWithdrawalDto,
    ConfirmWithdrawalDto,
    WithdrawalResponseDto,
} from './dto/index.js';

/**
 * Wallet response DTO
 */
class WalletResponseDto {
    address: string;
    chain: string;
    walletType: string;
    createdAt: string;
}

/**
 * DepositController
 * 
 * Handles deposit operations with enterprise-grade security.
 * All endpoints require JWT authentication.
 * 
 * OWASP A04:2021 - Insecure Design
 * - Rate limiting on all financial operations
 * - Dual authentication (JWT + Privy) for sensitive operations
 * - Comprehensive audit logging
 */
@ApiTags('Deposits')
@ApiBearerAuth()
@Controller('deposits')
@UseGuards(JwtAuthGuard, RateLimitGuard)
export class DepositController {
    private readonly logger = new Logger(DepositController.name);

    constructor(
        private readonly depositService: DepositService,
        private readonly privyService: PrivyService,
        private readonly auditService: DepositAuditService,
    ) { }

    /**
     * Extract request metadata for audit logging
     */
    private getAuditMetadata(req: Request) {
        return {
            ipAddress: req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown',
            userAgent: req.headers['user-agent'] || 'unknown',
            deviceFingerprint: req.headers['x-device-fingerprint']?.toString(),
            requestId: req.headers['x-request-id']?.toString(),
        };
    }

    /**
     * Get current user's balance
     */
    @Get('balance')
    @RateLimit(RateLimits.HIGH) // 300 req/min - read operation
    @ApiOperation({
        summary: 'Get user balance',
        description: 'Returns the current balance, locked balance, and available balance for the authenticated user.',
    })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Balance retrieved successfully',
        type: BalanceResponseDto,
    })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Not authenticated' })
    async getBalance(@CurrentUser('id') userId: string): Promise<BalanceResponseDto> {
        this.logger.debug(`Getting balance for user ${userId}`);
        return this.depositService.getBalance(userId);
    }

    /**
     * Generate or get deposit wallet address
     * RATE LIMITED: 5 requests per minute to prevent wallet enumeration
     */
    @Post('wallet/generate')
    @HttpCode(HttpStatus.OK)
    @RateLimit({ limit: 5, windowSeconds: 60 }) // Strict: prevents wallet enumeration
    @ApiOperation({
        summary: 'Generate deposit wallet',
        description: 'Creates or retrieves a Privy embedded wallet for the user on the specified chain. This wallet address can be used to receive deposits.',
    })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                chain: { type: 'string', enum: ['ethereum', 'base', 'solana', 'sui'], default: 'base' },
                privyUserId: { type: 'string', description: 'Privy user ID from frontend' },
            },
            required: ['privyUserId'],
        },
    })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Wallet generated or retrieved successfully',
        type: WalletResponseDto,
    })
    @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid chain or Privy not configured' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Not authenticated' })
    @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded' })
    async generateWallet(
        @CurrentUser('id') userId: string,
        @Body() body: { chain?: string; privyUserId?: string },
        @Req() req: Request,
    ): Promise<WalletResponseDto> {
        const chain = (body.chain || 'base') as string;

        // OWASP A03:2021 - Injection Prevention
        // Validate chain parameter to prevent invalid input
        const validChains = ['ethereum', 'base', 'solana', 'sui'];
        if (!validChains.includes(chain.toLowerCase())) {
            this.logger.warn(`Invalid chain requested: ${chain} by user ${userId}`);
            throw new BadRequestException(
                `Invalid chain: ${chain}. Valid chains are: ${validChains.join(', ')}`
            );
        }

        const normalizedChain = chain.toLowerCase();
        this.logger.log(`Generating wallet for user ${userId} on ${normalizedChain}`);

        // Use the authenticated user ID (UUID) directly
        // The service will handle mapping to Privy DID (importing if needed)
        const wallet = await this.depositService.getOrCreateDepositWallet(userId, normalizedChain);

        // Audit log
        await this.auditService.logWalletGenerated(
            userId,
            normalizedChain,
            wallet.address,
            this.getAuditMetadata(req),
        );

        return {
            address: wallet.address,
            chain: wallet.chain,
            walletType: wallet.walletType,
            createdAt: wallet.createdAt,
        };
    }


    /**
     * Get user's deposit wallet for a chain
     */
    @Get('wallet/:chain')
    @RateLimit(RateLimits.STANDARD) // 30 req/min
    @ApiOperation({
        summary: 'Get deposit wallet',
        description: 'Get the user\'s deposit wallet address for a specific chain.',
    })
    @ApiParam({ name: 'chain', enum: ['ethereum', 'base', 'solana', 'sui'] })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Wallet retrieved successfully',
        type: WalletResponseDto,
    })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No wallet found for this chain' })
    async getWallet(
        @CurrentUser('id') userId: string,
        @Param('chain') chain: string,
    ): Promise<WalletResponseDto | null> {
        this.logger.debug(`Getting wallet for user ${userId} on ${chain}`);
        return this.depositService.getPrivyWallet(userId, chain as DepositChain);
    }

    /**
     * Initiate a new deposit
     * RATE LIMITED: 10 requests per minute
     */
    @Post('initiate')
    @HttpCode(HttpStatus.OK)
    @RateLimit({ limit: 10, windowSeconds: 60 }) // Moderate limit
    @ApiOperation({
        summary: 'Initiate deposit',
        description: 'Initiates a new deposit and returns a nonce and deposit address. The nonce must be used within 5 minutes.',
    })
    @ApiBody({ type: InitiateDepositDto })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Deposit initiated successfully',
        type: InitiateDepositResponseDto,
    })
    @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid amount or chain' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Not authenticated' })
    @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded' })
    async initiateDeposit(
        @CurrentUser('id') userId: string,
        @Body() dto: InitiateDepositDto,
        @Req() req: Request,
    ): Promise<InitiateDepositResponseDto> {
        this.logger.log(`Initiating deposit for user ${userId}: ${dto.amount} ${dto.chain}`);

        const result = await this.depositService.initiateDeposit(userId, dto);

        // Audit log
        await this.auditService.logDepositInitiated(
            userId,
            result.nonce,
            dto.amount,
            dto.chain,
            this.getAuditMetadata(req),
        );

        return result;
    }

    /**
     * Verify and confirm a deposit
     * RATE LIMITED: 20 requests per minute
     */
    @Post('verify')
    @HttpCode(HttpStatus.OK)
    @RateLimit({ limit: 20, windowSeconds: 60 })
    @ApiOperation({
        summary: 'Verify deposit',
        description: 'Verifies the blockchain transaction and confirms the deposit, crediting the user\'s balance.',
    })
    @ApiBody({ type: VerifyDepositDto })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Deposit verified and confirmed',
        type: DepositTransactionDto,
    })
    @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid nonce or transaction' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Deposit not found or expired' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Not authenticated' })
    async verifyDeposit(
        @CurrentUser('id') userId: string,
        @Body() dto: VerifyDepositDto,
        @Req() req: Request,
    ): Promise<DepositTransactionDto> {
        this.logger.log(`Verifying deposit for user ${userId}: ${dto.nonce}`);

        try {
            const result = await this.depositService.verifyDeposit(userId, dto);

            // Audit successful verification
            await this.auditService.logDepositVerified(
                userId,
                dto.nonce,
                dto.txHash,
                parseFloat(result.amount),
                result.chain,
                this.getAuditMetadata(req),
            );

            return result;
        } catch (error) {
            // Audit failed verification
            await this.auditService.logDepositFailed(
                userId,
                dto.nonce,
                error.message || 'Unknown error',
                this.getAuditMetadata(req),
            );
            throw error;
        }
    }

    /**
     * Get deposit history
     */
    @Get('history')
    @RateLimit(RateLimits.HIGH) // 300 req/min - read operation
    @ApiOperation({
        summary: 'Get deposit history',
        description: 'Returns paginated deposit transaction history for the authenticated user.',
    })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'History retrieved successfully',
    })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Not authenticated' })
    async getHistory(
        @CurrentUser('id') userId: string,
        @Query() query: DepositHistoryQueryDto,
    ): Promise<{ data: DepositTransactionDto[]; total: number }> {
        this.logger.debug(`Getting deposit history for user ${userId}`);
        return this.depositService.getHistory(userId, query);
    }

    /**
     * Initiate a withdrawal
     * RATE LIMITED: 3 requests per minute (very strict - financial operation)
     * REQUIRES: Privy token verification for dual authentication
     */
    @Post('withdraw')
    @HttpCode(HttpStatus.OK)
    @UseGuards(PrivyAuthGuard)
    @RequirePrivy({ strictUserMatch: true, allowBypassIfNotConfigured: true })
    @RateLimit({ limit: 3, windowSeconds: 60 }) // Very strict for withdrawals
    @ApiOperation({
        summary: 'Initiate withdrawal',
        description: 'Initiates a withdrawal request, locking user funds. Requires Privy authentication.',
    })
    @ApiHeader({ name: 'x-privy-token', required: false, description: 'Privy access token for dual authentication' })
    @ApiBody({ type: InitiateWithdrawalDto })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Withdrawal initiated successfully',
        type: WithdrawalResponseDto,
    })
    @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded' })
    async initiateWithdrawal(
        @CurrentUser('id') userId: string,
        @Body() dto: InitiateWithdrawalDto,
        @Req() req: Request,
    ): Promise<WithdrawalResponseDto> {
        this.logger.log(`Initiating withdrawal for user ${userId}: ${dto.amount} ${dto.chain}`);

        const result = await this.depositService.initiateWithdrawal(userId, dto);

        // Audit log
        await this.auditService.logWithdrawalInitiated(
            userId,
            result.id,
            dto.amount,
            dto.chain,
            dto.toAddress,
            this.getAuditMetadata(req),
        );

        return result;
    }

    /**
     * Confirm a withdrawal
     * RATE LIMITED: 3 requests per minute
     * REQUIRES: Privy token verification
     */
    @Post('withdraw/confirm')
    @HttpCode(HttpStatus.OK)
    @UseGuards(PrivyAuthGuard)
    @RequirePrivy({ strictUserMatch: true, allowBypassIfNotConfigured: true })
    @RateLimit({ limit: 3, windowSeconds: 60 })
    @ApiOperation({
        summary: 'Confirm withdrawal',
        description: 'Confirms a withdrawal transaction after blockchain transfer. Requires Privy authentication.',
    })
    @ApiHeader({ name: 'x-privy-token', required: false, description: 'Privy access token for dual authentication' })
    @ApiBody({ type: ConfirmWithdrawalDto })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Withdrawal confirmed successfully',
        type: WithdrawalResponseDto,
    })
    async confirmWithdrawal(
        @CurrentUser('id') userId: string,
        @Body() dto: ConfirmWithdrawalDto,
        @Req() req: Request,
    ): Promise<WithdrawalResponseDto> {
        this.logger.log(`Confirming withdrawal for user ${userId}: ${dto.withdrawalId}`);

        const result = await this.depositService.confirmWithdrawal(userId, dto);

        // Audit log
        await this.auditService.log({
            eventType: AuditEventType.WITHDRAWAL_CONFIRMED,
            userId,
            data: {
                withdrawalId: dto.withdrawalId,
                txHash: dto.txHash,
                amount: result.amount,
                chain: result.chain,
            },
            metadata: this.getAuditMetadata(req),
        });

        return result;
    }
}

