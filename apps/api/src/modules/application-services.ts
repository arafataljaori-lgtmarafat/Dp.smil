import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import {
  CaseService,
  CreationService,
  GenerationService,
  MediaService,
  MediaUploadSessionService,
  ProjectService,
  type ClockPort,
  type DigestPort,
  type GenerationQueuePort,
  type IdGeneratorPort,
  type ObjectStoragePort,
  type SmileSimulationProviderPort,
  type UnitOfWorkPort,
} from '@dentpilot/application';

import type { AppConfig } from '../config/app-config.js';

export const infrastructureTokens = {
  config: Symbol('APP_CONFIG'),
  actorResolver: Symbol('ACTOR_RESOLVER'),
  unitOfWork: Symbol('UNIT_OF_WORK'),
  storage: Symbol('OBJECT_STORAGE'),
  digest: Symbol('DIGEST'),
  mediaInspector: Symbol('MEDIA_INSPECTOR'),
  queue: Symbol('GENERATION_QUEUE'),
  provider: Symbol('SMILE_SIMULATION_PROVIDER'),
  passwordHasher: Symbol('PASSWORD_HASHER'),
  sessionTokenGenerator: Symbol('SESSION_TOKEN_GENERATOR'),
  tokenDigest: Symbol('TOKEN_DIGEST'),
  emailDelivery: Symbol('EMAIL_DELIVERY'),
  actionLinks: Symbol('ACCOUNT_ACTION_LINKS'),
  authRateLimiter: Symbol('AUTH_RATE_LIMITER'),
  rateLimitKeyDeriver: Symbol('RATE_LIMIT_KEY_DERIVER'),
  applicationServices: Symbol('APPLICATION_SERVICES'),
} as const;

export class UuidGenerator implements IdGeneratorPort {
  public next(): string {
    return randomUUID();
  }
}

export class SystemClock implements ClockPort {
  public now(): Date {
    return new Date();
  }
}

export interface ApplicationServices {
  readonly cases: CaseService;
  readonly media: MediaService;
  readonly uploadSessions: MediaUploadSessionService;
  readonly projects: ProjectService;
  readonly creations: CreationService;
  readonly generations: GenerationService;
}

@Injectable()
export class ApplicationServiceFactory {
  public constructor(
    @Inject(infrastructureTokens.config) private readonly config: AppConfig,
    @Inject(infrastructureTokens.unitOfWork) private readonly unitOfWork: UnitOfWorkPort,
    @Inject(infrastructureTokens.storage) private readonly storage: ObjectStoragePort,
    @Inject(infrastructureTokens.digest) private readonly digest: DigestPort,
    @Inject(infrastructureTokens.queue) private readonly queue: GenerationQueuePort,
    @Inject(infrastructureTokens.provider) private readonly provider: SmileSimulationProviderPort,
  ) {}

  public create(): ApplicationServices {
    const ids = new UuidGenerator();
    const clock = new SystemClock();
    return {
      cases: new CaseService(this.unitOfWork, ids, clock),
      media: new MediaService(this.unitOfWork, this.storage),
      uploadSessions: new MediaUploadSessionService(
        this.unitOfWork,
        ids,
        clock,
        this.config.MEDIA_UPLOAD_SESSION_TTL_SECONDS,
      ),
      projects: new ProjectService(this.unitOfWork, ids, clock),
      creations: new CreationService(this.unitOfWork, this.digest, ids, clock, this.config.MAX_CREATION_DOCUMENT_BYTES),
      generations: new GenerationService(
        this.unitOfWork,
        this.storage,
        this.digest,
        this.queue,
        this.provider,
        ids,
        clock,
        this.config.MEDIA_STREAM_COLLECTION_MAX_BYTES,
      ),
    };
  }
}
