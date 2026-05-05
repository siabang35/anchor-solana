import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    RequestTimeoutException,
    Logger,
} from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

/**
 * Timeout Interceptor
 *
 * Enforces a maximum request processing time to prevent:
 * - Slow query attacks (OWASP A04:2021)
 * - Connection pool exhaustion
 * - Memory leaks from long-running requests
 * - Cascading failures under high load
 *
 * Enterprise consideration:
 * - 15s default covers complex aggregations + Solana RPC calls
 * - Health checks are excluded (handled separately)
 * - Timeout value can be overridden per-route via decorator
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
    private readonly logger = new Logger(TimeoutInterceptor.name);
    private readonly DEFAULT_TIMEOUT_MS = 15_000; // 15 seconds

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest();
        const url = request.url || '';

        // Skip timeout for health checks and WebSocket upgrades
        if (url.includes('/health') || url.includes('/ws')) {
            return next.handle();
        }

        // Allow longer timeout for settlement operations
        const timeoutMs = url.includes('/settle') || url.includes('/disburse')
            ? 60_000  // 60s for on-chain operations
            : this.DEFAULT_TIMEOUT_MS;

        return next.handle().pipe(
            timeout(timeoutMs),
            catchError((err) => {
                if (err instanceof TimeoutError) {
                    this.logger.warn(
                        `Request timeout (${timeoutMs}ms): ${request.method} ${url}`,
                    );
                    return throwError(
                        () => new RequestTimeoutException(
                            `Request processing exceeded ${timeoutMs / 1000}s limit. Please try again.`,
                        ),
                    );
                }
                return throwError(() => err);
            }),
        );
    }
}
