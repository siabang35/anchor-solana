import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Request ID Middleware
 * 
 * Generates a cryptographically secure UUID v4 for each request.
 * This enables:
 * - Request tracing across logs
 * - Security event correlation
 * - Audit trail linkage
 * - Incident investigation
 * 
 * OWASP: Logging and Monitoring - Request correlation
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
    private readonly HEADER_NAME = 'X-Request-ID';

    use(req: Request, res: Response, next: NextFunction): void {
        // Use existing request ID from trusted proxy, or generate new one
        const existingId = req.headers['x-request-id'] as string;

        // Validate existing ID format (must be valid UUID v4)
        const requestId = this.isValidUUID(existingId)
            ? existingId
            : randomUUID();

        // Attach to request for use in handlers and logging
        (req as any).requestId = requestId;

        // Add to response headers for client correlation
        res.setHeader(this.HEADER_NAME, requestId);

        next();
    }

    /**
     * Validate UUID v4 format to prevent injection via header
     */
    private isValidUUID(id: string | undefined): boolean {
        if (!id) return false;
        const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        return uuidV4Regex.test(id);
    }
}
