import {
    Controller,
    Get,
    Patch,
    Delete,
    Param,
    Query,
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
import { NotificationsService } from './notifications.service.js';
import {
    NotificationDto,
    NotificationsQueryDto,
    NotificationPreferencesDto,
    UpdateNotificationPreferencesDto,
    UnreadCountDto,
} from './dto/index.js';

interface AuthenticatedRequest extends Request {
    user: {
        id: string;
        email?: string;
        walletAddress?: string;
        chain?: string;
    };
}

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
    constructor(private readonly notificationsService: NotificationsService) { }

    @Get()
    @ApiOperation({ summary: 'Get user notifications' })
    @ApiResponse({ status: 200, type: [NotificationDto] })
    async getNotifications(
        @Query() query: NotificationsQueryDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.notificationsService.getNotifications(req.user.id, query);
    }

    @Get('unread-count')
    @ApiOperation({ summary: 'Get unread notification count' })
    @ApiResponse({ status: 200, type: UnreadCountDto })
    async getUnreadCount(@Req() req: AuthenticatedRequest): Promise<UnreadCountDto> {
        const count = await this.notificationsService.getUnreadCount(req.user.id);
        return { count };
    }

    @Patch(':id/read')
    @ApiOperation({ summary: 'Mark notification as read' })
    @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200 })
    async markAsRead(
        @Param('id', ParseUUIDPipe) id: string,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.notificationsService.markAsRead(req.user.id, id);
    }

    @Patch('read-all')
    @ApiOperation({ summary: 'Mark all notifications as read' })
    @ApiResponse({ status: 200 })
    async markAllAsRead(@Req() req: AuthenticatedRequest) {
        return this.notificationsService.markAllAsRead(req.user.id);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Archive a notification' })
    @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200 })
    async archiveNotification(
        @Param('id', ParseUUIDPipe) id: string,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.notificationsService.archiveNotification(req.user.id, id);
    }

    @Get('preferences')
    @ApiOperation({ summary: 'Get notification preferences' })
    @ApiResponse({ status: 200, type: NotificationPreferencesDto })
    async getPreferences(@Req() req: AuthenticatedRequest): Promise<NotificationPreferencesDto> {
        return this.notificationsService.getPreferences(req.user.id);
    }

    @Patch('preferences')
    @ApiOperation({ summary: 'Update notification preferences' })
    @ApiResponse({ status: 200, type: NotificationPreferencesDto })
    async updatePreferences(
        @Body() dto: UpdateNotificationPreferencesDto,
        @Req() req: AuthenticatedRequest,
    ): Promise<NotificationPreferencesDto> {
        return this.notificationsService.updatePreferences(req.user.id, dto);
    }
}
