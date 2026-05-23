import { Controller, Get, Req } from '@nestjs/common';
import { DashboardService } from './dashboard.service.js';

/**
 * Dashboard Controller
 * Handles dashboard data querying with support for wallet-connected users
 */
@Controller('dashboard')
export class DashboardController {
    constructor(private readonly dashboardService: DashboardService) { }

    /**
     * GET /dashboard
     * Get dashboard overview for current user
     */
    @Get()
    async getDashboard(@Req() req: any) {
        const userId = req.user?.id || req.headers['x-user-id'];
        return this.dashboardService.getDashboardData(userId);
    }

    /**
     * GET /dashboard/stats
     * Get user statistics
     */
    @Get('stats')
    async getStats(@Req() req: any) {
        const userId = req.user?.id || req.headers['x-user-id'];
        return this.dashboardService.getUserStats(userId);
    }

    /**
     * GET /dashboard/activity
     * Get recent user activity
     */
    @Get('activity')
    async getActivity(@Req() req: any) {
        const userId = req.user?.id || req.headers['x-user-id'];
        return this.dashboardService.getRecentActivity(userId);
    }

    /**
     * GET /dashboard/portfolio
     * Get user's portfolio/positions
     */
    @Get('portfolio')
    async getPortfolio(@Req() req: any) {
        const userId = req.user?.id || req.headers['x-user-id'];
        return this.dashboardService.getPortfolio(userId);
    }
}
