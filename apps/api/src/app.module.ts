import { Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { LoggerModule, PinoLogger } from 'nestjs-pino';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import type { AppConfig } from './config/app-config.js';
import { AuthenticationGuard } from './common/authentication.guard.js';
import { HealthController } from './controllers/health.controller.js';
import { CasesController } from './controllers/cases.controller.js';
import { CreationsController } from './controllers/creations.controller.js';
import { MediaController } from './controllers/media.controller.js';
import { MediaUploadsController } from './controllers/media-uploads.controller.js';
import { ProjectsController } from './controllers/projects.controller.js';
import { GenerationsController } from './controllers/generations.controller.js';
import { AiWebhookController } from './controllers/ai-webhook.controller.js';
import { AuthController } from './controllers/auth.controller.js';
import { AccountController } from './controllers/account.controller.js';
import { SharpMediaInspectorAdapter, NodeSha256Adapter } from './infrastructure/media/media-inspector.adapter.js';
import { StreamingMediaIngestService } from './infrastructure/media/streaming-media-ingest.service.js';
import { MediaUploadReconcilerService } from './infrastructure/media/media-upload-reconciler.service.js';
import { MediaUploadRecoveryBootstrap } from './infrastructure/media/media-upload-recovery.bootstrap.js';
import { MockSmileSimulationProvider } from './infrastructure/media/mock-smile-simulation.provider.js';
import { PrismaService } from './infrastructure/persistence/prisma.service.js';
import { PrismaUnitOfWork } from './infrastructure/persistence/prisma-unit-of-work.js';
import { InMemoryGenerationQueueAdapter } from './infrastructure/queue/in-memory-generation-queue.adapter.js';
import { LocalObjectStorageAdapter } from './infrastructure/storage/local-object-storage.adapter.js';
import { S3ObjectStorageAdapter } from './infrastructure/storage/s3-object-storage.adapter.js';
import { StorageReadinessProbe } from './infrastructure/storage/storage-readiness.probe.js';
import { Argon2idPasswordHasher } from './infrastructure/security/argon2id-password-hasher.adapter.js';
import { SecureSessionTokenGenerator, Sha256TokenDigest } from './infrastructure/security/secure-token-primitives.adapter.js';
import { HmacSha256RateLimitKeyDeriver, PostgresAuthRateLimiter } from './infrastructure/security/postgres-auth-rate-limiter.adapter.js';
import { DevelopmentOutboxEmailAdapter } from './infrastructure/email/development-outbox-email.adapter.js';
import { SmtpEmailAdapter } from './infrastructure/email/smtp-email.adapter.js';
import { AccountActionLinkFactory } from './infrastructure/email/account-action-link.factory.js';
import { AuthService } from './modules/auth/auth.service.js';
import { ApplicationServiceFactory, infrastructureTokens, type ApplicationServices } from './modules/application-services.js';
import { GenerationQueueBootstrap } from './modules/generation-queue.bootstrap.js';

@Module({})
export class AppModule {
  public static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            level: config.NODE_ENV === 'production' ? 'info' : 'debug',
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.headers.x-api-key',
                'req.body',
                'req.body.password',
                'req.body.passwordHash',
                'req.body.token',
                'req.body.verificationToken',
                'req.body.resetToken',
                'res.headers.set-cookie',
              ],
              censor: '[REDACTED]',
            },
          },
        }),
        ThrottlerModule.forRoot([{
          ttl: 60000,
          limit: 100,
        }]),
      ],
      controllers: [
        HealthController,
        CasesController,
        CreationsController,
        MediaController,
        MediaUploadsController,
        ProjectsController,
        GenerationsController,
    AiWebhookController,
        AuthController,
        AccountController,
      ],
      providers: [
        { provide: infrastructureTokens.config, useValue: config },
        PrismaService,
        {
          provide: infrastructureTokens.unitOfWork,
          inject: [PrismaService],
          useFactory: (prisma: PrismaService) => new PrismaUnitOfWork(prisma),
        },
        {
          provide: infrastructureTokens.storage,
          inject: [infrastructureTokens.config],
          useFactory: (appConfig: AppConfig) => appConfig.OBJECT_STORAGE_DRIVER === 's3'
            ? new S3ObjectStorageAdapter({
              bucket: appConfig.S3_BUCKET!,
              region: appConfig.S3_REGION!,
              forcePathStyle: appConfig.S3_FORCE_PATH_STYLE,
              ...(appConfig.S3_ENDPOINT ? { endpoint: appConfig.S3_ENDPOINT } : {}),
              ...(appConfig.S3_ACCESS_KEY_ID ? { accessKeyId: appConfig.S3_ACCESS_KEY_ID } : {}),
              ...(appConfig.S3_SECRET_ACCESS_KEY ? { secretAccessKey: appConfig.S3_SECRET_ACCESS_KEY } : {}),
              ...(appConfig.S3_SERVER_SIDE_ENCRYPTION ? { serverSideEncryption: appConfig.S3_SERVER_SIDE_ENCRYPTION } : {}),
              ...(appConfig.S3_SSE_KMS_KEY_ID ? { sseKmsKeyId: appConfig.S3_SSE_KMS_KEY_ID } : {}),
            })
            : new LocalObjectStorageAdapter(appConfig.LOCAL_OBJECT_STORAGE_ROOT),
        },
        StorageReadinessProbe,
        { provide: infrastructureTokens.digest, useClass: NodeSha256Adapter },
        { provide: infrastructureTokens.mediaInspector, useClass: SharpMediaInspectorAdapter },
        { provide: infrastructureTokens.provider, useClass: MockSmileSimulationProvider },
        {
          provide: infrastructureTokens.passwordHasher,
          inject: [infrastructureTokens.config],
          useFactory: (appConfig: AppConfig) =>
            new Argon2idPasswordHasher({
              memoryCost: appConfig.ARGON2_MEMORY_COST,
              timeCost: appConfig.ARGON2_TIME_COST,
              parallelism: appConfig.ARGON2_PARALLELISM,
            }),
        },
        { provide: infrastructureTokens.sessionTokenGenerator, useClass: SecureSessionTokenGenerator },
        { provide: infrastructureTokens.tokenDigest, useClass: Sha256TokenDigest },
        {
          provide: infrastructureTokens.emailDelivery,
          inject: [infrastructureTokens.config],
          useFactory: (appConfig: AppConfig) => appConfig.EMAIL_DELIVERY_MODE === 'smtp'
            ? new SmtpEmailAdapter({ host: appConfig.SMTP_HOST!, port: appConfig.SMTP_PORT!, username: appConfig.SMTP_USERNAME!, password: appConfig.SMTP_PASSWORD!, from: appConfig.SMTP_FROM! })
            : new DevelopmentOutboxEmailAdapter(appConfig.DEVELOPMENT_EMAIL_OUTBOX_ROOT),
        },
        {
          provide: infrastructureTokens.actionLinks,
          inject: [infrastructureTokens.config],
          useFactory: (appConfig: AppConfig) => new AccountActionLinkFactory(appConfig.AUTH_ACTION_URL_BASE),
        },
        {
          provide: infrastructureTokens.rateLimitKeyDeriver,
          inject: [infrastructureTokens.config],
          useFactory: (appConfig: AppConfig) => new HmacSha256RateLimitKeyDeriver(appConfig.AUTH_RATE_LIMIT_HMAC_SECRET),
        },
        {
          provide: infrastructureTokens.authRateLimiter,
          inject: [PrismaService],
          useFactory: (prisma: PrismaService) => new PostgresAuthRateLimiter(prisma),
        },
        {
          provide: AuthService,
          inject: [PrismaService, infrastructureTokens.passwordHasher, infrastructureTokens.sessionTokenGenerator, infrastructureTokens.tokenDigest, infrastructureTokens.emailDelivery, infrastructureTokens.actionLinks, infrastructureTokens.authRateLimiter, infrastructureTokens.rateLimitKeyDeriver, infrastructureTokens.config],
          useFactory: (prisma: PrismaService, passwordHasher: Argon2idPasswordHasher, sessionTokens: SecureSessionTokenGenerator, tokenDigest: Sha256TokenDigest, emailDelivery: DevelopmentOutboxEmailAdapter | SmtpEmailAdapter, actionLinks: AccountActionLinkFactory, rateLimiter: PostgresAuthRateLimiter, keyDeriver: HmacSha256RateLimitKeyDeriver, appConfig: AppConfig) => new AuthService(prisma, passwordHasher, sessionTokens, tokenDigest, emailDelivery, actionLinks, rateLimiter, keyDeriver, appConfig),
        },
        {
          provide: APP_GUARD,
          inject: [Reflector, AuthService],
          useFactory: (reflector: Reflector, auth: AuthService) => new AuthenticationGuard(reflector, auth),
        },
        {
          provide: APP_GUARD,
          useClass: ThrottlerGuard,
        },
        {
          provide: infrastructureTokens.queue,
          inject: [infrastructureTokens.config, PinoLogger],
          useFactory: (appConfig: AppConfig, logger: PinoLogger) =>
            new InMemoryGenerationQueueAdapter(appConfig.MOCK_GENERATION_DELAY_MS, (error, message) => {
              logger.error(
                {
                  err: error,
                  correlationId: message.correlationId,
                  ownerUserId: message.ownerUserId,
                  generationJobId: message.jobId,
                },
                'Generation worker execution failed',
              );
            }),
        },
        ApplicationServiceFactory,
        {
          provide: infrastructureTokens.applicationServices,
          inject: [ApplicationServiceFactory],
          useFactory: (factory: ApplicationServiceFactory) => factory.create(),
        },
        {
          provide: MediaUploadReconcilerService,
          inject: [infrastructureTokens.config, infrastructureTokens.unitOfWork, infrastructureTokens.storage],
          useFactory: (appConfig: AppConfig, unitOfWork: PrismaUnitOfWork, storage: LocalObjectStorageAdapter | S3ObjectStorageAdapter) =>
            new MediaUploadReconcilerService(appConfig, unitOfWork, storage),
        },
        {
          provide: MediaUploadRecoveryBootstrap,
          inject: [infrastructureTokens.config, MediaUploadReconcilerService],
          useFactory: (appConfig: AppConfig, reconciler: MediaUploadReconcilerService) => new MediaUploadRecoveryBootstrap(appConfig, reconciler),
        },
        {
          provide: StreamingMediaIngestService,
          inject: [infrastructureTokens.config, infrastructureTokens.storage, infrastructureTokens.applicationServices],
          useFactory: (appConfig: AppConfig, storage: LocalObjectStorageAdapter | S3ObjectStorageAdapter, services: ApplicationServices) =>
            new StreamingMediaIngestService(appConfig, storage, services.uploadSessions),
        },
        GenerationQueueBootstrap,
      ],
    };
  }
}
