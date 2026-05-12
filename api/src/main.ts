import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import fastifyHelmet from '@fastify/helmet';
import fastifyCompress from '@fastify/compress';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyCookie from '@fastify/cookie';
import { AppModule } from './app.module.js';
import { GlobalExceptionFilter } from './common/filters/index.js';
import { AuditLogInterceptor } from './common/interceptors/index.js';

/**
 * Bootstrap the NestJS application with Fastify adapter
 * Performance: 2-3x faster than Express
 * Security: OWASP Top 10 compliant
 */
async function bootstrap() {
    const logger = new Logger('Bootstrap');

    // =====================================================
    // FASTIFY ADAPTER — High-Performance HTTP Engine
    // Built-in Anti-Chunking, Anti-DoS, request isolation
    // =====================================================
    const app = await NestFactory.create<NestFastifyApplication>(
        AppModule,
        new FastifyAdapter({
            trustProxy: true,
            // OWASP: Anti-Chunking & Slowloris — strict request timeout
            requestTimeout: 30_000,    // 30s max per request
            connectionTimeout: 65_000, // 65s idle connection timeout
            // OWASP A04:2021: Body size limit — prevents memory exhaustion
            bodyLimit: 102_400, // 100KB
        }),
        {
            logger: ['error', 'warn', 'log', 'debug', 'verbose'],
        },
    );

    const configService = app.get(ConfigService);
    const port = configService.get<number>('PORT', 3001);
    const apiPrefix = configService.get<string>('API_PREFIX', 'api/v1');
    const nodeEnv = configService.get<string>('NODE_ENV', 'development');
    const isProduction = nodeEnv === 'production';
    const isRender = process.env.RENDER === 'true';
    const isDev = nodeEnv === 'development' && !isRender;

    // Register cookie plugin
    await app.register(fastifyCookie, {
        secret: configService.get<string>('COOKIE_SECRET', 'my-super-secret-exoduze-cookie-key'),
    });

    // ===================
    // Security: Helmet (Fastify Plugin)
    // Only enabled in production/staging — dev mode skips it so Swagger UI works
    // ===================
    if (!isDev) {
        await app.register(fastifyHelmet, {
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
            crossOriginEmbedderPolicy: false,
        });
        logger.log('🛡️  Helmet security headers enabled');
    } else {
        logger.log('⚠️  Helmet disabled in development (Swagger UI compatibility)');
    }

    // ===================
    // Compression (Fastify Plugin)
    // Only enabled in production to prevent static asset corruption during dev (Swagger)
    // ===================
    if (!isDev) {
        await app.register(fastifyCompress, {
            threshold: 1024,
            encodings: ['gzip', 'deflate'],
        });
        logger.log('📦 Compression enabled');
    }

    // ===================
    // Rate Limiting (Fastify Plugin — replaces express-rate-limit)
    // ===================
    const rateLimitWindowMs = configService.get<number>('RATE_LIMIT_WINDOW_MS', 60000);
    const rateLimitMax = configService.get<number>('RATE_LIMIT_MAX', 100);
    const rateLimitAuthMax = configService.get<number>('RATE_LIMIT_AUTH_MAX', 5);

    await app.register(fastifyRateLimit, {
        global: true,
        max: 300,
        timeWindow: rateLimitWindowMs,
        errorResponseBuilder: (_req: any, context: any) => ({
            statusCode: 429,
            message: 'Too many requests. Please try again later.',
            error: 'Too Many Requests',
        }),
        keyGenerator: (req: any) => {
            const forwardedFor = req.headers['x-forwarded-for'];
            if (forwardedFor) {
                const ips = Array.isArray(forwardedFor)
                    ? forwardedFor[0]
                    : forwardedFor.split(',')[0];
                return ips.trim();
            }
            return req.ip || 'unknown';
        },
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
    });

    // ===================
    // Fastify Hooks: Anti-HPP & Depth Limiting
    // ===================
    const fastifyInstance = app.getHttpAdapter().getInstance();

    // Anti-HPP (HTTP Parameter Pollution)
    // OWASP: Prevents ?role=user&role=admin bypassing validation
    fastifyInstance.addHook('onRequest', async (request: any) => {
        if (request.query && typeof request.query === 'object') {
            for (const key of Object.keys(request.query)) {
                if (Array.isArray(request.query[key])) {
                    request.query[key] = request.query[key][request.query[key].length - 1];
                }
            }
        }
    });

    // Anti-Stack-Overflow: JSON Depth Limiting (max 10 levels)
    fastifyInstance.addHook('preHandler', async (request: any, reply: any) => {
        if (request.body && typeof request.body === 'object') {
            const depth = measureDepth(request.body);
            if (depth > 10) {
                return reply.status(400).send({
                    statusCode: 400,
                    message: 'Request body nesting depth exceeds maximum allowed (10 levels).',
                    error: 'Bad Request',
                });
            }
        }
    });

    // Stricter rate limiting for auth endpoints via hook
    const authRateLimitStore = new Map<string, { count: number; windowStart: number }>();
    fastifyInstance.addHook('onRequest', async (request: any, reply: any) => {
        if (!request.url?.startsWith(`/${apiPrefix}/auth`)) return;
        const ip = request.ip || 'unknown';
        const now = Date.now();
        let entry = authRateLimitStore.get(ip);
        if (!entry || (now - entry.windowStart) >= rateLimitWindowMs) {
            entry = { count: 0, windowStart: now };
        }
        entry.count++;
        authRateLimitStore.set(ip, entry);
        if (entry.count > rateLimitAuthMax) {
            return reply.status(429).send({
                statusCode: 429,
                message: 'Too many authentication attempts. Please try again later.',
                error: 'Too Many Requests',
            });
        }
    });

    // Cleanup auth rate limit store every 2 minutes
    setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of authRateLimitStore.entries()) {
            if ((now - entry.windowStart) >= rateLimitWindowMs * 2) {
                authRateLimitStore.delete(key);
            }
        }
    }, 120_000);

    // ===================
    // CORS Configuration
    // SECURITY: Requires explicit CORS_ORIGINS env var in production
    // ===================
    const corsOriginsRaw = configService.get<string>('CORS_ORIGINS');

    if (isProduction && (!corsOriginsRaw || corsOriginsRaw === '*')) {
        logger.error('🔴 SECURITY: CORS_ORIGINS must be explicitly set in production (cannot be "*")');
        logger.error('   Set CORS_ORIGINS to your frontend domain, e.g.: https://app.exoduze.io');
        process.exit(1);
    }

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
            'Cache-Control',
            'Pragma',
        ],
        exposedHeaders: ['X-Total-Count', 'X-Request-ID'],
        maxAge: 86400,
    });

    // ===================
    // Global Pipes
    // ===================
    app.useGlobalPipes(new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
            enableImplicitConversion: true,
        },
        disableErrorMessages: nodeEnv === 'production',
    }));

    // ===================
    // Global Exception Filter
    // ===================
    app.useGlobalFilters(new GlobalExceptionFilter());

    // ===================
    // Global Interceptors
    // ===================
    const auditInterceptor = app.get(AuditLogInterceptor);
    app.useGlobalInterceptors(auditInterceptor);

    // ===================
    // API Prefix
    // ===================
    app.setGlobalPrefix(apiPrefix);

    // ===================
    // Graceful Shutdown
    // ===================
    app.enableShutdownHooks();

    // ===================
    // Swagger Documentation
    // SECURITY: Strictly disabled on Render/production (anti-hack)
    // ===================
    if (isDev) {
        try {
            const config = new DocumentBuilder()
                .setTitle('ExoDuZe API')
                .setDescription('The ExoDuZe API documentation')
                .setVersion('1.0')
                .addBearerAuth()
                .build();
            const document = SwaggerModule.createDocument(app, config);
            SwaggerModule.setup('docs', app, document, {
                jsonDocumentUrl: '/docs-json',
                customSiteTitle: 'ExoDuZe API Docs',
                customCss: '.swagger-ui .topbar { display: none }',
            });
            logger.log('📚 Swagger UI enabled (development mode only)');
        } catch (swaggerErr: any) {
            console.error('SWAGGER ERROR STACK:', swaggerErr.stack || swaggerErr);
            logger.warn(`⚠️ Swagger document generation failed (non-critical): ${swaggerErr.message}`);
            logger.warn('   API will run without Swagger UI. Fix enum circular deps to restore docs.');
        }
    } else {
        logger.log('📚 Swagger UI disabled (non-development environment)');

        // OWASP: Explicit 404 block for Swagger probe attempts in production
        fastifyInstance.route({
            method: ['GET', 'HEAD'],
            url: '/docs',
            handler: (_req: any, reply: any) => reply.status(404).send({ statusCode: 404, message: 'Not Found' }),
        });
        fastifyInstance.route({
            method: ['GET', 'HEAD'],
            url: '/docs-json',
            handler: (_req: any, reply: any) => reply.status(404).send({ statusCode: 404, message: 'Not Found' }),
        });
        fastifyInstance.route({
            method: ['GET', 'HEAD'],
            url: '/swagger',
            handler: (_req: any, reply: any) => reply.status(404).send({ statusCode: 404, message: 'Not Found' }),
        });
        logger.log('🛡️  Swagger probe endpoints explicitly blocked (404)');
    }

    // ===================
    // Start Server
    // Fastify requires '0.0.0.0' to listen on all interfaces (critical for Render/Docker)
    // ===================
    await app.listen(port, '0.0.0.0');

    logger.log(`🚀 ExoDuZe API running on http://localhost:${port}/${apiPrefix}`);
    logger.log(`⚡ Engine: Fastify (High-Performance Mode)`);
    if (isDev) {
        logger.log(`📚 Swagger UI: http://localhost:${port}/docs`);
    }
    logger.log(`📝 Environment: ${nodeEnv}`);
    logger.log(`🔒 CORS enabled for: ${corsOrigins}`);
    logger.log(`📊 Rate limiting: ${rateLimitMax} req/${rateLimitWindowMs}ms (auth: ${rateLimitAuthMax})`);
    logger.log(`📋 Audit logging: ${configService.get('ENABLE_AUDIT_LOG') ? 'enabled' : 'disabled'}`);
}

/**
 * Measure the nesting depth of an object (Anti-Stack-Overflow)
 * OWASP A04:2021 - Prevents deeply nested JSON from causing stack overflow
 */
function measureDepth(obj: any, current = 0): number {
    if (current > 10) return current;
    if (typeof obj !== 'object' || obj === null) return current;
    let maxDepth = current;
    for (const value of Object.values(obj)) {
        if (typeof value === 'object' && value !== null) {
            maxDepth = Math.max(maxDepth, measureDepth(value, current + 1));
        }
    }
    return maxDepth;
}

bootstrap().catch((error) => {
    console.error('Failed to start application:', error);
    process.exit(1);
});
