import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    Logger,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { ConfigService } from '@nestjs/config';

interface AuditLogEntry {
    timestamp: string;
    requestId: string;
    userId: string | null;
    action: string;
    resource: string;
    method: string;
    statusCode: number;
    duration: number;
    ip: string;
    userAgent: string;
    success: boolean;
    errorMessage?: string;
}

/**
 * Audit Log Interceptor
 * Logs security-relevant actions for compliance and forensics
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
    private readonly logger = new Logger('AuditLog');
    private readonly auditEnabled: boolean;

    // Actions that should be audited
    private readonly auditedPaths = [
        '/auth/signup',
        '/auth/login',
        '/auth/logout',
        '/auth/wallet',
        '/auth/google',
        '/auth/magic-link',
        '/auth/refresh',
        '/dashboard',
        '/users',
    ];

    constructor(private readonly configService: ConfigService) {
        this.auditEnabled = this.configService.get('ENABLE_AUDIT_LOG') !== 'false';
    }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        if (!this.auditEnabled) {
            return next.handle();
        }

        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();

        // Check if this path should be audited
        const shouldAudit = this.auditedPaths.some((path) =>
            request.url.includes(path),
        );

        if (!shouldAudit) {
            return next.handle();
        }

        const startTime = Date.now();
        const requestId = request.requestId || 'unknown';

        return next.handle().pipe(
            tap(() => {
                const duration = Date.now() - startTime;
                this.logAuditEntry({
                    timestamp: new Date().toISOString(),
                    requestId,
                    userId: request.user?.id || null,
                    action: this.getAction(request.method, request.url),
                    resource: request.url.split('?')[0],
                    method: request.method,
                    statusCode: response.statusCode,
                    duration,
                    ip: this.getClientIp(request),
                    userAgent: request.headers['user-agent'] || 'unknown',
                    success: true,
                });
            }),
            catchError((error) => {
                const duration = Date.now() - startTime;
                this.logAuditEntry({
                    timestamp: new Date().toISOString(),
                    requestId,
                    userId: request.user?.id || null,
                    action: this.getAction(request.method, request.url),
                    resource: request.url.split('?')[0],
                    method: request.method,
                    statusCode: error.status || 500,
                    duration,
                    ip: this.getClientIp(request),
                    userAgent: request.headers['user-agent'] || 'unknown',
                    success: false,
                    errorMessage: error.message,
                });
                return throwError(() => error);
            }),
        );
    }

    private logAuditEntry(entry: AuditLogEntry) {
        const logMessage = `[AUDIT] ${entry.action} | User: ${entry.userId || 'anonymous'} | ${entry.method} ${entry.resource} | ${entry.statusCode} | ${entry.duration}ms | IP: ${entry.ip}`;

        if (entry.success) {
            this.logger.log(logMessage);
        } else {
            this.logger.warn(`${logMessage} | Error: ${entry.errorMessage}`);
        }

        // In production, you might want to persist this to the audit_logs table
        // await this.supabaseService.getAdminClient().from('audit_logs').insert(entry);
    }

    private getAction(method: string, url: string): string {
        const path = url.split('?')[0].split('/').filter(Boolean);
        const lastSegment = path[path.length - 1] || 'unknown';

        const methodActions: Record<string, string> = {
            GET: 'READ',
            POST: 'CREATE',
            PUT: 'UPDATE',
            PATCH: 'UPDATE',
            DELETE: 'DELETE',
        };

        return `${methodActions[method] || method}_${lastSegment.toUpperCase()}`;
    }

    private getClientIp(request: any): string {
        const forwardedFor = request.headers['x-forwarded-for'];
        if (forwardedFor) {
            const ips = Array.isArray(forwardedFor)
                ? forwardedFor[0]
                : forwardedFor.split(',')[0];
            return ips.trim();
        }
        return request.ip || request.socket?.remoteAddress || 'unknown';
    }
}
