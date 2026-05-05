import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

/**
 * Health Check Controller
 *
 * Enterprise-grade health endpoint for:
 * - Load balancer health probes (Render, AWS ALB, etc.)
 * - Kubernetes liveness/readiness probes
 * - Monitoring dashboards (Datadog, Grafana, etc.)
 * - Incident response diagnostics
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
    private readonly startedAt = Date.now();

    @Get()
    @ApiOperation({ summary: 'Health check endpoint' })
    check() {
        const memUsage = process.memoryUsage();
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: Math.floor(process.uptime()),
            version: '2.0.0',
            adapter: 'fastify',
            memory: {
                rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
                heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
                heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
            },
        };
    }
}
