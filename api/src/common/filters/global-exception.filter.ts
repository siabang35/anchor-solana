import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

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
 * Provides consistent error response format with security considerations
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger('ExceptionFilter');

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        const requestId = (request as any).requestId;

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
                `[${requestId}] ${request.method} ${request.url} - ${status} ${message}`,
            );
        }

        const errorResponse: ErrorResponse = {
            statusCode: status,
            message: Array.isArray(message) ? message.join(', ') : message,
            error,
            timestamp: new Date().toISOString(),
            path: request.url,
        };

        // Only include requestId in development
        if (process.env.NODE_ENV !== 'production') {
            errorResponse.requestId = requestId;
        }

        response.status(status).json(errorResponse);
    }
}
