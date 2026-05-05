import { NestFactory } from '@nestjs/core';
import {
    FastifyAdapter,
    NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { GlobalExceptionFilter } from './common/filters/index.js';
import { AuditLogInterceptor } from './common/interceptors/index.js';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor.js';
import { CacheResponseInterceptor } from './common/interceptors/cache-response.interceptor.js';

/**
 * Bootstrap the NestJS application with Fastify adapter
 * Enterprise-grade configuration with comprehensive security
 *
 * Fastify advantages:
 * - ~2-3x faster JSON serialization than Express
 * - Built-in schema validation and serialization
 * - Plugin-based architecture (no middleware compatibility issues)
 * - Better backpressure handling
 * - Lower memory footprint under load
 */
async function bootstrap() {
    const logger = new Logger('Bootstrap');

    // ═══════════════════════════════════════════
    // Fastify Adapter Configuration
    // ═══════════════════════════════════════════
    const fastifyAdapter = new FastifyAdapter({
        // Request ID generation (built-in, cryptographically secure)
        genReqId: () => crypto.randomUUID(),
        // Request size limits (DoS prevention — OWASP A04:2021)
        bodyLimit: 102_400,        // 100KB max body
        // Connection management
        connectionTimeout: 30_000, // 30s connection timeout
        keepAliveTimeout: 72_000,  // 72s keep-alive (> ALB default 60s)
        // Logging
        logger: false, // Use NestJS logger instead
        // Disable Fastify's default error handler (we use our own)
        disableRequestLogging: true,
    });

    const app = await NestFactory.create<NestFastifyApplication>(
        AppModule,
        fastifyAdapter,
        {
            logger: ['error', 'warn', 'log', 'debug', 'verbose'],
            // Abort on error during initialization for fast-fail
            abortOnError: true,
        },
    );

    const configService = app.get(ConfigService);
    const port = configService.get<number>('PORT', 3001);
    const apiPrefix = configService.get<string>('API_PREFIX', 'api/v1');
    const nodeEnv = configService.get<string>('NODE_ENV', 'development');
    const isProduction = nodeEnv === 'production';

    // ═══════════════════════════════════════════
    // Fastify Security Plugins
    // ═══════════════════════════════════════════

    // 1. Helmet — Security headers (Fastify-native plugin)
    await app.register(import('@fastify/helmet'), {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:', 'https:'],
                scriptSrc: ["'self'"],
                connectSrc: ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co'],
            },
        },
        hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
        },
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
        crossOriginEmbedderPolicy: false, // Required for some OAuth flows
    });

    // 2. Compression — Response compression (Fastify-native)
    await app.register(import('@fastify/compress'), {
        // Brotli > gzip for modern clients
        encodings: ['br', 'gzip', 'deflate'],
        // Only compress responses > 1KB
        threshold: 1024,
        // Don't compress small/already-compressed responses
        removeContentLengthHeader: false,
    });

    // 3. Cookie Parser — Required for auth (refresh tokens, CSRF, OAuth sessions)
    await app.register(import('@fastify/cookie'), {
        secret: configService.get<string>('COOKIE_SECRET', 'exoduze-cookie-secret-change-me'),
        parseOptions: {
            httpOnly: true,
            secure: isProduction,
            sameSite: 'strict',
        },
    });

    // 4. Multipart — File upload support (avatars, etc.)
    await app.register(import('@fastify/multipart'), {
        limits: {
            fileSize: 5 * 1024 * 1024,  // 5MB max file
            files: 1,                     // 1 file per request
            fields: 10,                   // Max form fields
        },
    });

    // 3. Rate Limiting — Anti-throttling (Fastify-native)
    await app.register(import('@fastify/rate-limit'), {
        global: true,
        max: 300,                          // 300 req/min globally
        timeWindow: 60_000,                // 1 minute window
        ban: 5,                            // Ban after 5 violations
        cache: 10_000,                     // Track up to 10K unique IPs
        allowList: [],                     // No allowlisted IPs
        continueExceeding: false,          // Don't reset timer on new requests
        enableDraftSpec: true,             // Use RFC 7231 headers
        addHeadersOnExceeding: {
            'x-ratelimit-limit': true,
            'x-ratelimit-remaining': true,
            'x-ratelimit-reset': true,
        },
        addHeaders: {
            'x-ratelimit-limit': true,
            'x-ratelimit-remaining': true,
            'x-ratelimit-reset': true,
            'retry-after': true,
        },
        keyGenerator: (req) => {
            // Use X-Forwarded-For if behind proxy, otherwise use IP
            const forwardedFor = req.headers['x-forwarded-for'];
            if (forwardedFor) {
                const ips = Array.isArray(forwardedFor)
                    ? forwardedFor[0]
                    : forwardedFor.split(',')[0];
                return ips.trim();
            }
            return req.ip || 'unknown';
        },
        errorResponseBuilder: (_req, context) => ({
            statusCode: 429,
            message: `Too many requests. Rate limit: ${context.max} per ${context.after}. Please try again later.`,
            error: 'Too Many Requests',
        }),
    });

    // ═══════════════════════════════════════════
    // CORS Configuration
    // SECURITY: Requires explicit CORS_ORIGINS in production
    // ═══════════════════════════════════════════
    const corsOriginsRaw = configService.get<string>('CORS_ORIGINS');

    // In production, CORS_ORIGINS MUST be explicitly set (no wildcard)
    if (isProduction && (!corsOriginsRaw || corsOriginsRaw === '*')) {
        logger.error('🔴 SECURITY: CORS_ORIGINS must be explicitly set in production (cannot be "*")');
        logger.error('   Set CORS_ORIGINS to your frontend domain, e.g.: https://app.exoduze.io');
        process.exit(1);
    }

    // Development fallback: allow localhost origins
    const corsOrigins = corsOriginsRaw || 'http://localhost:3000,http://localhost:3001';
    if (corsOrigins === '*') {
        logger.warn('⚠️  CORS is set to wildcard "*" — this is NOT safe for production');
    }

    app.enableCors({
        origin: corsOrigins === '*' ? '*' : corsOrigins.split(',').map(origin => origin.trim()),
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-Requested-With',
            'X-Request-ID',
            'X-User-ID',
            'Cache-Control',  // Required for frontend cache bypass
            'Pragma',         // Required for frontend cache bypass
            'If-None-Match',  // ETag support for conditional requests
        ],
        exposedHeaders: [
            'X-Total-Count',
            'X-Request-ID',
            'ETag',
            'X-Response-Time',
            'X-RateLimit-Limit',
            'X-RateLimit-Remaining',
            'X-RateLimit-Reset',
        ],
        maxAge: 86400, // 24 hours
    });

    // ═══════════════════════════════════════════
    // Fastify Hooks — Security & Performance
    // ═══════════════════════════════════════════
    const fastify = app.getHttpAdapter().getInstance();

    // Request-level hooks for security headers + timing
    fastify.addHook('onRequest', async (request, reply) => {
        // Start timing
        (request as any)._startTime = process.hrtime.bigint();

        // Additional security headers (beyond Helmet)
        reply.header('X-Content-Type-Options', 'nosniff');
        reply.header('X-Frame-Options', 'DENY');
        reply.header('X-XSS-Protection', '0');
        reply.header('X-DNS-Prefetch-Control', 'off');
        reply.header('X-Download-Options', 'noopen');
        reply.header('X-Permitted-Cross-Domain-Policies', 'none');
        reply.header('Cross-Origin-Opener-Policy', 'same-origin');
        reply.header('Cross-Origin-Resource-Policy', 'same-origin');
        reply.header('Permissions-Policy', [
            'accelerometer=()',
            'camera=()',
            'geolocation=()',
            'gyroscope=()',
            'magnetometer=()',
            'microphone=()',
            'payment=()',
            'usb=()',
            'interest-cohort=()',
        ].join(', '));
        reply.header('X-API-Version', '1.0');

        // Cache-Control for sensitive endpoints
        const isSensitive = request.url.includes('/auth')
            || request.url.includes('/users')
            || request.url.includes('/dashboard');
        if (isSensitive) {
            reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            reply.header('Pragma', 'no-cache');
            reply.header('Expires', '0');
        }
    });

    // Response timing header
    fastify.addHook('onSend', async (request, reply) => {
        const startTime = (request as any)._startTime;
        if (startTime) {
            const elapsed = Number(process.hrtime.bigint() - startTime) / 1_000_000;
            reply.header('X-Response-Time', `${elapsed.toFixed(2)}ms`);
            // Server-Timing for developer tools (dev only)
            if (!isProduction) {
                reply.header('Server-Timing', `total;dur=${elapsed.toFixed(2)}`);
            }
        }
    });

    // ═══════════════════════════════════════════
    // Input Sanitization Hook (Anti-XSS / Anti-Injection)
    // Runs on every POST/PUT/PATCH request
    // ═══════════════════════════════════════════
    const DANGEROUS_PATTERNS = [
        /<script\b[^>]*>/gi,
        /<\/script>/gi,
        /javascript:/gi,
        /on\w+\s*=/gi,
        /<iframe\b/gi,
        /<object\b/gi,
        /<embed\b/gi,
        /<link\b/gi,
        /<meta\b/gi,
        /<style\b/gi,
        /vbscript:/gi,
        /expression\s*\(/gi,
        /eval\s*\(/gi,
        /new\s+Function\s*\(/gi,
    ];

    const STRICT_FIELDS = [
        'email', 'password', 'username', 'phone', 'address',
        'walletAddress', 'signature', 'nonce',
    ];

    function sanitizeValue(value: string, fieldName: string): string {
        let isDangerous = false;
        for (const pattern of DANGEROUS_PATTERNS) {
            pattern.lastIndex = 0; // Reset regex state
            if (pattern.test(value)) {
                isDangerous = true;
                break;
            }
        }

        if (isDangerous) {
            if (STRICT_FIELDS.includes(fieldName)) return '';
            return value
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#x27;')
                .replace(/\//g, '&#x2F;');
        }

        if (STRICT_FIELDS.includes(fieldName) && /<[^>]+>/g.test(value)) {
            return value.replace(/<[^>]+>/g, '');
        }
        return value;
    }

    function sanitizeObject(obj: Record<string, any>): Record<string, any> {
        const result: Record<string, any> = {};
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                result[key] = sanitizeValue(value, key);
            } else if (Array.isArray(value)) {
                result[key] = value.map((item) => {
                    if (typeof item === 'string') return sanitizeValue(item, key);
                    if (typeof item === 'object' && item !== null) return sanitizeObject(item);
                    return item;
                });
            } else if (typeof value === 'object' && value !== null) {
                result[key] = sanitizeObject(value);
            } else {
                result[key] = value;
            }
        }
        return result;
    }

    fastify.addHook('preHandler', async (request) => {
        // Sanitize body on mutating requests
        if (['POST', 'PUT', 'PATCH'].includes(request.method) && request.body && typeof request.body === 'object') {
            request.body = sanitizeObject(request.body as Record<string, any>);
        }
        // Sanitize query params
        if (request.query && typeof request.query === 'object') {
            (request as any).query = sanitizeObject(request.query as Record<string, any>);
        }
    });

    // ═══════════════════════════════════════════
    // Stricter rate limit for auth endpoints
    // ═══════════════════════════════════════════
    const rateLimitAuthMax = configService.get<number>('RATE_LIMIT_AUTH_MAX', 5);
    fastify.register(import('@fastify/rate-limit'), {
        max: rateLimitAuthMax,
        timeWindow: 60_000,
        keyGenerator: (req) => {
            const forwardedFor = req.headers['x-forwarded-for'];
            if (forwardedFor) {
                const ips = Array.isArray(forwardedFor)
                    ? forwardedFor[0]
                    : forwardedFor.split(',')[0];
                return `auth:${ips.trim()}`;
            }
            return `auth:${req.ip || 'unknown'}`;
        },
        errorResponseBuilder: () => ({
            statusCode: 429,
            message: 'Too many authentication attempts. Please try again later.',
            error: 'Too Many Requests',
        }),
        onExceeding: (_req, key) => {
            logger.warn(`⚠️  Auth rate limit approaching for ${key}`);
        },
        onExceeded: (_req, key) => {
            logger.warn(`🔴 Auth rate limit exceeded for ${key}`);
        },
    });

    // ═══════════════════════════════════════════
    // Global Pipes
    // ═══════════════════════════════════════════
    app.useGlobalPipes(new ValidationPipe({
        whitelist: true,              // Strip unknown properties (anti-manipulation)
        forbidNonWhitelisted: true,   // Throw error on unknown properties
        transform: true,              // Auto-transform payloads to DTO instances
        transformOptions: {
            enableImplicitConversion: true,
        },
        disableErrorMessages: isProduction,
    }));

    // ═══════════════════════════════════════════
    // Global Exception Filter (adapter-agnostic)
    // ═══════════════════════════════════════════
    app.useGlobalFilters(new GlobalExceptionFilter());

    // ═══════════════════════════════════════════
    // Global Interceptors
    // ═══════════════════════════════════════════
    const auditInterceptor = app.get(AuditLogInterceptor);
    app.useGlobalInterceptors(
        new TimeoutInterceptor(),           // Request timeout protection (15s)
        new CacheResponseInterceptor(),     // ETag + conditional response caching
        auditInterceptor,                   // Audit logging
    );

    // ═══════════════════════════════════════════
    // API Prefix
    // ═══════════════════════════════════════════
    app.setGlobalPrefix(apiPrefix);

    // ═══════════════════════════════════════════
    // Graceful Shutdown
    // ═══════════════════════════════════════════
    app.enableShutdownHooks();

    // ═══════════════════════════════════════════
    // Swagger Documentation
    // SECURITY: Only available in explicit development mode
    // ═══════════════════════════════════════════
    if (!isProduction) {
        const config = new DocumentBuilder()
            .setTitle('ExoDuZe API')
            .setDescription('The ExoDuZe API documentation — Fastify-powered')
            .setVersion('2.0')
            .addBearerAuth()
            .build();
        const document = SwaggerModule.createDocument(app, config);
        SwaggerModule.setup('docs', app, document);
        logger.log('📚 Swagger UI enabled (development mode only)');
    } else {
        logger.log('📚 Swagger UI disabled (non-development environment)');
    }

    // ═══════════════════════════════════════════
    // Trust Proxy (for production behind load balancer)
    // ═══════════════════════════════════════════
    const trustedProxies = configService.get<string>('TRUSTED_PROXIES');
    if (trustedProxies) {
        fastify.addHook('onRequest', async (request) => {
            // Trust proxy headers for rate limiting and logging
            (request as any).trustProxy = true;
        });
    }

    // ═══════════════════════════════════════════
    // Start Server — Listen on 0.0.0.0 for container/cloud deployment
    // ═══════════════════════════════════════════
    await app.listen(port, '0.0.0.0');

    logger.log(`🚀 ExoDuZe API (Fastify) running on http://0.0.0.0:${port}/${apiPrefix}`);
    if (!isProduction) {
        logger.log(`📚 Swagger UI: http://localhost:${port}/docs`);
    }
    logger.log(`📝 Environment: ${nodeEnv}`);
    logger.log(`🔒 CORS enabled for: ${corsOrigins}`);
    logger.log(`📊 Rate limiting: 300 req/min (auth: ${rateLimitAuthMax})`);
    logger.log(`📋 Audit logging: ${configService.get('ENABLE_AUDIT_LOG') ? 'enabled' : 'disabled'}`);
    logger.log(`⚡ Adapter: Fastify (high-performance mode)`);
}

bootstrap().catch((error) => {
    console.error('Failed to start application:', error);
    process.exit(1);
});
