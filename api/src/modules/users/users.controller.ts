import {
    Controller,
    Get,
    Patch,
    Post,
    Delete,
    Body,
    Param,
    Req,
    UseGuards,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import { JwtAuthGuard } from '../auth/guards/index.js';
import { CurrentUser } from '../auth/decorators/index.js';
// Fastify-compatible: no FileInterceptor needed — use @fastify/multipart directly
import { UseInterceptors, UploadedFile, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator } from '@nestjs/common';
import { UpdateProfileDto, RequestEmailVerificationDto, VerifyEmailDto } from './dto/index.js';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get('me')
    async getProfile(@CurrentUser('id') userId: string) {
        return this.usersService.findById(userId);
    }

    @Patch('profile')
    async updateProfile(
        @CurrentUser('id') userId: string,
        @Body() body: UpdateProfileDto,
    ) {
        console.log(`[UsersController] Received profile update request for user ${userId}`);
        console.log(`[UsersController] Request body:`, JSON.stringify(body));

        // Build update object, filtering out undefined values
        const updateData: Record<string, any> = {};

        if (body.fullName !== undefined) {
            updateData.full_name = body.fullName;
        }
        if (body.bio !== undefined) {
            updateData.bio = body.bio;
        }
        if (body.preferences !== undefined) {
            updateData.preferences = body.preferences;
        }

        console.log(`[UsersController] Prepared update data:`, JSON.stringify(updateData));

        if (Object.keys(updateData).length === 0) {
            console.log(`[UsersController] No fields to update, returning current profile`);
            return this.usersService.findById(userId);
        }

        const result = await this.usersService.updateProfile(userId, updateData);
        console.log(`[UsersController] Update successful, returning:`, JSON.stringify(result));
        return result;
    }

    /**
     * POST /users/avatar
     * Upload avatar using Fastify multipart (@fastify/multipart)
     * Replaces Express-based FileInterceptor for Fastify compatibility
     */
    @Post('avatar')
    async uploadAvatar(
        @CurrentUser('id') userId: string,
        @Req() req: any,
    ) {
        // Use Fastify's multipart parsing
        const data = await req.file();
        if (!data) {
            throw new Error('No file uploaded');
        }

        // Validate file type
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedMimeTypes.includes(data.mimetype)) {
            throw new Error('Invalid file type. Allowed: jpg, png, webp');
        }

        // Read file buffer
        const buffer = await data.toBuffer();

        // Validate file size (5MB max)
        if (buffer.length > 5 * 1024 * 1024) {
            throw new Error('File too large. Maximum size: 5MB');
        }

        const file = {
            fieldname: 'file',
            originalname: data.filename,
            encoding: '7bit',
            mimetype: data.mimetype,
            buffer,
            size: buffer.length,
        };

        const publicUrl = await this.usersService.uploadAvatar(userId, file);
        return { avatarUrl: publicUrl };
    }

    @Post('wallets')
    async addWallet(
        @CurrentUser('id') userId: string,
        @Body() body: { address: string; chain: 'ethereum' | 'solana' | 'sui' | 'base' },
    ) {
        await this.usersService.addWalletAddress(userId, body.address, body.chain);
        return { message: 'Wallet added successfully' };
    }

    @Delete('wallets/:address')
    async removeWallet(
        @CurrentUser('id') userId: string,
        @Param('address') address: string,
        @Body() body: { chain: string } // Chain might be needed if address is not unique across chains (unlikely for EVM but possible generally)
    ) {
        // For now, assuming chain is passed in body or we might need to handle it better. 
        // Let's assume frontend passes chain as query param or body. 
        // The service method needs chain.
        // Let's stick to body for chain for now or just iterate to find it? 
        // Best practice: Pass chain in query or body. Let's use body for now as DELETE with body is discouraged but common, or maybe query param.
        // Let's use query param if we could, but body is easier to type here.
        // Actually, let's look at `removeWalletAddress` signature: (userId, address, chain).
        // I will trust the frontend to send the chain.

        return this.usersService.removeWalletAddress(userId, address, body.chain);
    }

    @Post('email/request-verification')
    async requestEmailVerification(
        @CurrentUser('id') userId: string,
        @Body() body: RequestEmailVerificationDto,
    ) {
        return this.usersService.requestEmailVerification(userId, body.email);
    }

    @Post('email/verify')
    async verifyEmail(
        @CurrentUser('id') userId: string,
        @Body() body: VerifyEmailDto,
    ) {
        return this.usersService.verifyEmailUpdate(userId, body.email, body.code);
    }
}

/**
 * Public controller for email verification (no auth required)
 * User clicks verification link from email before logging in
 */
@Controller('users')
export class UsersPublicController {
    constructor(private readonly usersService: UsersService) { }

    @Post('email/verify-link')
    @HttpCode(HttpStatus.OK)
    async verifyEmailLink(
        @Body() body: { email: string; token: string; uid?: string },
    ) {
        const profile = await this.usersService.verifyEmailWithToken(body.email, body.token, body.uid);
        return {
            message: 'Email verified successfully',
            email: profile.email,
            emailVerified: profile.email_verified,
            userId: profile.id,
        };
    }
}

