import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';

interface ErrorResponse {
    statusCode: number;
    message: string;
    error: string;
    timestamp: string;
    path: string;
    requestId?: string;
}

/**
 * Global HTTP Exception Filter
 *
 * Provides consistent error response format with security considerations.
 * Adapter-agnostic: works with both Express and Fastify.
 *
 * Security:
 * - Never exposes internal stack traces in production
 * - Includes request ID for incident correlation
 * - Masks detailed error messages in production
 * - Logs all 4xx/5xx for monitoring and alerting
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger('ExceptionFilter');

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();

        // Adapter-agnostic request properties
        const requestId = request.requestId || request.id || 'unknown';
        const requestUrl = request.url || request.originalUrl || '/';
        const requestMethod = request.method || 'UNKNOWN';

        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Internal server error';
        let error = 'Internal Server Error';

        if (exception instanceof HttpException) {
            status = exception.getStatus();
            const exceptionResponse = exception.getResponse();

            if (typeof exceptionResponse === 'object') {
                message = (exceptionResponse as any).message || exception.message;
                error = (exceptionResponse as any).error || exception.name;
            } else {
                message = exceptionResponse as string;
                error = exception.name;
            }
        } else if (exception instanceof Error) {
            // Don't expose internal error details in production
            if (process.env.NODE_ENV === 'production') {
                this.logger.error(
                    `[${requestId}] Unhandled exception: ${exception.message}`,
                    exception.stack,
                );
            } else {
                message = exception.message;
                error = exception.name;
                this.logger.error(
                    `[${requestId}] ${exception.message}`,
                    exception.stack,
                );
            }
        }

        // Log 4xx and 5xx errors
        if (status >= 400) {
            const logLevel = status >= 500 ? 'error' : 'warn';
            this.logger[logLevel](
                `[${requestId}] ${requestMethod} ${requestUrl} - ${status} ${message}`,
            );
        }

        const errorResponse: ErrorResponse = {
            statusCode: status,
            message: Array.isArray(message) ? message.join(', ') : message,
            error,
            timestamp: new Date().toISOString(),
            path: requestUrl,
        };

        // Only include requestId in development
        if (process.env.NODE_ENV !== 'production') {
            errorResponse.requestId = requestId;
        }

        // Adapter-agnostic response
        // Fastify: response.status(code).send(body)
        // Express: response.status(code).json(body)
        if (typeof response.status === 'function') {
            const result = response.status(status);
            if (typeof result.send === 'function') {
                result.send(errorResponse);
            } else if (typeof result.json === 'function') {
                result.json(errorResponse);
            }
        }
    }
}
