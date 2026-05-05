import {
    Controller,
    Get,
    Post,
    Patch,
    Param,
    Query,
    Body,
    UseGuards,
    Req,
    HttpCode,
    HttpStatus,
    ParseUUIDPipe,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiParam,
    ApiQuery,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AdminGuard, SuperAdminGuard } from './guards/index.js';
import { AdminService } from './admin.service.js';
import {
    AdminStatsDto,
    AdminUserDto,
    AdminUserDetailDto,
    AdminUsersQueryDto,
    UpdateUserStatusDto,
    PendingWithdrawalDto,
    ApproveWithdrawalDto,
    RejectWithdrawalDto,
    SystemAlertDto,
    UpdateAlertStatusDto,
    AdminAuditLogDto,
    AdminAuditLogQueryDto,
    AlertStatus,
    TrafficStatsDto,
    SecurityConfigDto,
    UpdateSecurityConfigDto,
    RequestLogDto, // Added RequestLogDto
    RequestLogQueryDto, // Added RequestLogQueryDto
} from './dto/index.js';

// Extend Express Request to include user and adminUser
interface AuthenticatedRequest extends Request {
    user: { sub: string; email?: string };
    adminUser?: { id: string; role: string; permissions: object };
}

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
    constructor(private readonly adminService: AdminService) { }

    // ========================================================================
    // PLATFORM STATISTICS
    // ========================================================================

    @Get('stats')
    @ApiOperation({ summary: 'Get platform statistics' })
    @ApiResponse({ status: 200, type: AdminStatsDto })
    async getStats(): Promise<AdminStatsDto> {
        return this.adminService.getStats();
    }

    // ========================================================================
    // USER MANAGEMENT
    // ========================================================================

    @Get('users')
    @ApiOperation({ summary: 'List users with filtering and pagination' })
    @ApiResponse({ status: 200, type: [AdminUserDto] })
    async getUsers(@Query() query: AdminUsersQueryDto) {
        return this.adminService.getUsers(query);
    }

    @Get('users/:id')
    @ApiOperation({ summary: 'Get detailed user information' })
    @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: AdminUserDetailDto })
    @ApiResponse({ status: 404, description: 'User not found' })
    async getUserDetail(
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<AdminUserDetailDto> {
        return this.adminService.getUserDetail(id);
    }

    @Patch('users/:id/status')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Update user status (suspend/activate)' })
    @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, description: 'User status updated' })
    @ApiResponse({ status: 404, description: 'User not found' })
    async updateUserStatus(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateUserStatusDto,
        @Req() req: AuthenticatedRequest,
    ) {
        const clientIp = req.ip || req.headers['x-forwarded-for'] as string;
        return this.adminService.updateUserStatus(id, dto, req.user.sub, clientIp);
    }

    // ========================================================================
    // WITHDRAWAL APPROVALS
    // ========================================================================

    @Get('withdrawals/pending')
    @ApiOperation({ summary: 'Get pending withdrawals requiring approval' })
    @ApiResponse({ status: 200, type: [PendingWithdrawalDto] })
    async getPendingWithdrawals(): Promise<PendingWithdrawalDto[]> {
        return this.adminService.getPendingWithdrawals();
    }

    @Post('withdrawals/:id/approve')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Approve a pending withdrawal' })
    @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, description: 'Withdrawal approved' })
    @ApiResponse({ status: 404, description: 'Withdrawal not found' })
    async approveWithdrawal(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: ApproveWithdrawalDto,
        @Req() req: AuthenticatedRequest,
    ) {
        const clientIp = req.ip || req.headers['x-forwarded-for'] as string;
        return this.adminService.approveWithdrawal(id, dto, req.user.sub, clientIp);
    }

    @Post('withdrawals/:id/reject')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Reject a pending withdrawal' })
    @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, description: 'Withdrawal rejected' })
    @ApiResponse({ status: 404, description: 'Withdrawal not found' })
    async rejectWithdrawal(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: RejectWithdrawalDto,
        @Req() req: AuthenticatedRequest,
    ) {
        const clientIp = req.ip || req.headers['x-forwarded-for'] as string;
        return this.adminService.rejectWithdrawal(id, dto, req.user.sub, clientIp);
    }

    // ========================================================================
    // SYSTEM ALERTS
    // ========================================================================

    @Get('alerts')
    @ApiOperation({ summary: 'Get system alerts' })
    @ApiQuery({ name: 'status', enum: AlertStatus, required: false })
    @ApiResponse({ status: 200, type: [SystemAlertDto] })
    async getAlerts(@Query('status') status?: AlertStatus): Promise<SystemAlertDto[]> {
        return this.adminService.getAlerts(status);
    }

    @Patch('alerts/:id')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Update alert status' })
    @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, description: 'Alert updated' })
    async updateAlertStatus(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateAlertStatusDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.adminService.updateAlertStatus(id, dto, req.user.sub);
    }

    // ========================================================================
    // AUDIT LOG (Super Admin Only)
    // ========================================================================

    @Get('audit-log')
    @UseGuards(SuperAdminGuard)
    @ApiOperation({ summary: 'Get admin audit log (Super Admin only)' })
    @ApiResponse({ status: 200, type: [AdminAuditLogDto] })
    async getAuditLog(@Query() query: AdminAuditLogQueryDto) {
        return this.adminService.getAuditLog(query);
    }
}
