import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Body,
    UseGuards,
    Req,
    ParseUUIDPipe,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiParam,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { SettingsService } from './settings.service.js';
import {
    UserSettingsDto,
    UpdateUserSettingsDto,
    ApiKeyDto,
    ApiKeyCreatedDto,
    CreateApiKeyDto,
    WhitelistAddressDto,
    AddWhitelistAddressDto,
    SocialConnectionDto,
} from './dto/index.js';

interface AuthenticatedRequest extends Request {
    user: { sub: string };
}

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
    constructor(private readonly settingsService: SettingsService) { }

    // ========================================================================
    // USER SETTINGS
    // ========================================================================

    @Get()
    @ApiOperation({ summary: 'Get user settings' })
    @ApiResponse({ status: 200, type: UserSettingsDto })
    async getSettings(@Req() req: AuthenticatedRequest): Promise<UserSettingsDto> {
        return this.settingsService.getSettings(req.user.sub);
    }

    @Patch()
    @ApiOperation({ summary: 'Update user settings' })
    @ApiResponse({ status: 200, type: UserSettingsDto })
    async updateSettings(
        @Body() dto: UpdateUserSettingsDto,
        @Req() req: AuthenticatedRequest,
    ): Promise<UserSettingsDto> {
        return this.settingsService.updateSettings(req.user.sub, dto);
    }

    // ========================================================================
    // API KEYS
    // ========================================================================

    @Get('api-keys')
    @ApiOperation({ summary: 'List API keys' })
    @ApiResponse({ status: 200, type: [ApiKeyDto] })
    async getApiKeys(@Req() req: AuthenticatedRequest): Promise<ApiKeyDto[]> {
        return this.settingsService.getApiKeys(req.user.sub);
    }

    @Post('api-keys')
    @ApiOperation({ summary: 'Create API key' })
    @ApiResponse({ status: 201, type: ApiKeyCreatedDto })
    async createApiKey(
        @Body() dto: CreateApiKeyDto,
        @Req() req: AuthenticatedRequest,
    ): Promise<ApiKeyCreatedDto> {
        return this.settingsService.createApiKey(req.user.sub, dto);
    }

    @Delete('api-keys/:id')
    @ApiOperation({ summary: 'Revoke API key' })
    @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200 })
    async revokeApiKey(
        @Param('id', ParseUUIDPipe) id: string,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.settingsService.revokeApiKey(req.user.sub, id);
    }

    // ========================================================================
    // WITHDRAWAL WHITELIST
    // ========================================================================

    @Get('whitelist')
    @ApiOperation({ summary: 'Get withdrawal whitelist' })
    @ApiResponse({ status: 200, type: [WhitelistAddressDto] })
    async getWhitelist(@Req() req: AuthenticatedRequest): Promise<WhitelistAddressDto[]> {
        return this.settingsService.getWhitelist(req.user.sub);
    }

    @Post('whitelist')
    @ApiOperation({ summary: 'Add address to whitelist' })
    @ApiResponse({ status: 201, type: WhitelistAddressDto })
    async addWhitelistAddress(
        @Body() dto: AddWhitelistAddressDto,
        @Req() req: AuthenticatedRequest,
    ): Promise<WhitelistAddressDto> {
        return this.settingsService.addWhitelistAddress(req.user.sub, dto);
    }

    @Delete('whitelist/:id')
    @ApiOperation({ summary: 'Remove address from whitelist' })
    @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200 })
    async removeWhitelistAddress(
        @Param('id', ParseUUIDPipe) id: string,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.settingsService.removeWhitelistAddress(req.user.sub, id);
    }

    // ========================================================================
    // SOCIAL CONNECTIONS
    // ========================================================================

    @Get('social')
    @ApiOperation({ summary: 'Get social connections' })
    @ApiResponse({ status: 200, type: [SocialConnectionDto] })
    async getSocialConnections(@Req() req: AuthenticatedRequest): Promise<SocialConnectionDto[]> {
        return this.settingsService.getSocialConnections(req.user.sub);
    }

    @Delete('social/:id')
    @ApiOperation({ summary: 'Disconnect social account' })
    @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200 })
    async disconnectSocial(
        @Param('id', ParseUUIDPipe) id: string,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.settingsService.disconnectSocial(req.user.sub, id);
    }
}
