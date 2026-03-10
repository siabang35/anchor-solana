import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/index.js';
import { CurrentUser } from '../auth/decorators/index.js';
import { DashboardService } from './dashboard.service.js';

interface UserPayload {
    id: string;
    email?: string;
    walletAddress?: string;
}

/**
 * Dashboard Controller
 * Protected endpoints for authenticated dashboard access
 */
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
    constructor(private readonly dashboardService: DashboardService) { }

    /**
     * GET /dashboard
     * Get dashboard overview for current user
     */
    @Get()
    async getDashboard(@CurrentUser() user: UserPayload) {
        return this.dashboardService.getDashboardData(user.id);
    }

    /**
     * GET /dashboard/stats
     * Get user statistics
     */
    @Get('stats')
    async getStats(@CurrentUser() user: UserPayload) {
        return this.dashboardService.getUserStats(user.id);
    }

    /**
     * GET /dashboard/activity
     * Get recent user activity
     */
    @Get('activity')
    async getActivity(@CurrentUser() user: UserPayload) {
        return this.dashboardService.getRecentActivity(user.id);
    }

    /**
     * GET /dashboard/portfolio
     * Get user's portfolio/positions
     */
    @Get('portfolio')
    async getPortfolio(@CurrentUser() user: UserPayload) {
        return this.dashboardService.getPortfolio(user.id);
    }
}
