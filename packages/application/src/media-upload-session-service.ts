import {
  MediaIngestError,
  NotFoundError,
  actorAuditShape,
  assertHumanActor,
  assertIdempotencyKey,
  ownerUserIdForActor,
} from '@dentpilot/domain';

import { sourceMediaStorageKey } from './object-storage-keys.js';
import type {
  Actor,
  ClockPort,
  IdGeneratorPort,
  MediaUploadSessionRecord,
  UnitOfWorkPort,
} from './ports.js';

export interface ClaimedMediaUpload {
  readonly session: MediaUploadSessionRecord;
  readonly claimed: boolean;
}

/**
 * Owns durable upload-session state and the PostgreSQL half of source-media finalization.
 * Filesystem staging, binary inspection, and object streaming stay in API infrastructure.
 */
export class MediaUploadSessionService {
  public constructor(
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly ids: IdGeneratorPort,
    private readonly clock: ClockPort,
    private readonly sessionTtlSeconds: number,
  ) {}

  public async create(
    actor: Actor,
    input: { readonly caseId: string; readonly idempotencyKey: string },
  ): Promise<{ readonly session: MediaUploadSessionRecord; readonly created: boolean }> {
    const human = assertHumanActor(actor);
    const ownerUserId = ownerUserIdForActor(human);
    const patientCase = await this.unitOfWork.cases.findById(ownerUserId, input.caseId);
    if (patientCase === null) {
      throw new NotFoundError(`Case ${input.caseId} was not found for the current user.`);
    }
    const createdAt = this.clock.now();
    const expiresAt = new Date(createdAt.getTime() + this.sessionTtlSeconds * 1000);
    return this.unitOfWork.transaction(({ uploadSessions }) => uploadSessions.createOrFindByIdempotency({
      id: this.ids.next(),
      ownerUserId,
      caseId: patientCase.id,
      idempotencyKey: assertIdempotencyKey(input.idempotencyKey),
      status: 'created',
      createdAt,
      expiresAt,
    }));
  }

  public async get(actor: Actor, uploadSessionId: string): Promise<MediaUploadSessionRecord> {
    const ownerUserId = ownerUserIdForActor(actor);
    const session = await this.unitOfWork.uploadSessions.findById(ownerUserId, uploadSessionId);
    if (session === null) {
      throw new NotFoundError(`Media upload ${uploadSessionId} was not found for the current user.`);
    }
    return session;
  }

  public async claimForContent(actor: Actor, uploadSessionId: string): Promise<ClaimedMediaUpload> {
    const human = assertHumanActor(actor);
    const session = await this.get(human, uploadSessionId);
    const now = this.clock.now();
    if (session.status === 'committed') return { session, claimed: false };
    if (session.status === 'processing') {
      throw new MediaIngestError('UPLOAD_IN_PROGRESS', 'Upload content was already claimed for processing.');
    }
    if (session.status === 'expired') {
      throw new MediaIngestError('UPLOAD_SESSION_EXPIRED', 'Upload session has already expired.');
    }
    if (session.status === 'failed') {
      throw new MediaIngestError('PERSISTENCE_FAILED', 'Upload session previously failed and cannot be reused.');
    }

    if (session.expiresAt <= now) {
      await this.unitOfWork.transaction(({ uploadSessions }) => uploadSessions.markExpired({
        ownerUserId: session.ownerUserId,
        uploadSessionId: session.id,
        now,
        finishedAt: now,
      }));
      throw new MediaIngestError('UPLOAD_SESSION_EXPIRED', 'Upload session lifetime elapsed before content processing.');
    }

    const targetMediaId = this.ids.next();
    const claimed = await this.unitOfWork.transaction(({ uploadSessions }) => uploadSessions.claimForProcessing({
      ownerUserId: session.ownerUserId,
      uploadSessionId: session.id,
      processingToken: this.ids.next(),
      targetMediaId,
      targetStorageKey: sourceMediaStorageKey(session.ownerUserId, session.caseId, targetMediaId),
      startedAt: now,
      now,
    }));
    if (claimed !== null) return { session: claimed, claimed: true };

    const current = await this.get(human, uploadSessionId);
    if (current.status === 'committed') return { session: current, claimed: false };
    if (current.status === 'processing') {
      throw new MediaIngestError('UPLOAD_IN_PROGRESS', 'Upload content was claimed by another request.');
    }
    if (current.status === 'expired') {
      throw new MediaIngestError('UPLOAD_SESSION_EXPIRED', 'Upload session expired before content processing.');
    }
    throw new MediaIngestError('PERSISTENCE_FAILED', 'Upload session state could not be claimed safely.');
  }

  public async finalizeSource(
    actor: Actor,
    input: {
      readonly uploadSession: MediaUploadSessionRecord;
      readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
      readonly byteSize: number;
      readonly width: number;
      readonly height: number;
      readonly sha256: string;
    },
  ): Promise<{ readonly mediaId: string }> {
    const human = assertHumanActor(actor);
    const session = input.uploadSession;
    if (
      session.status !== 'processing' ||
      session.processingToken === null ||
      session.targetMediaId === null ||
      session.targetStorageKey === null ||
      session.ownerUserId !== human.userId
    ) {
      throw new MediaIngestError('PERSISTENCE_FAILED', 'Upload session did not hold a valid processing claim.');
    }
    const now = this.clock.now();
    await this.unitOfWork.transaction(async ({ media, audits, uploadSessions }) => {
      await media.create({
        id: session.targetMediaId!,
        ownerUserId: session.ownerUserId,
        caseId: session.caseId,
        kind: 'source',
        purpose: 'source_photo',
        mimeType: input.mimeType,
        byteSize: input.byteSize,
        width: input.width,
        height: input.height,
        sha256: input.sha256,
        storageKey: session.targetStorageKey!,
        sourceMediaId: null,
        createdById: human.userId,
      });
      await audits.append({
        id: this.ids.next(),
        ownerUserId: session.ownerUserId,
        ...actorAuditShape(human),
        eventType: 'MediaUploaded',
        caseId: session.caseId,
        projectId: null,
        generationJobId: null,
        occurredAt: now,
        correlationId: human.requestId,
        metadata: {
          mediaId: session.targetMediaId!,
          kind: 'source',
          sha256: input.sha256,
          byteSize: input.byteSize,
          mimeType: input.mimeType,
        },
      });
      const committed = await uploadSessions.markCommitted({
        ownerUserId: session.ownerUserId,
        uploadSessionId: session.id,
        processingToken: session.processingToken!,
        committedMediaId: session.targetMediaId!,
        finishedAt: now,
      });
      if (committed === null) {
        throw new MediaIngestError('PERSISTENCE_FAILED', 'Upload session finalization lost its processing claim.');
      }
    });
    return { mediaId: session.targetMediaId };
  }

  public async markStorageCleanupComplete(actor: Actor, uploadSession: MediaUploadSessionRecord): Promise<void> {
    const human = assertHumanActor(actor);
    if (uploadSession.ownerUserId !== human.userId) return;
    await this.unitOfWork.transaction(({ uploadSessions }) => uploadSessions.markStorageCleanupComplete({
      ownerUserId: uploadSession.ownerUserId,
      uploadSessionId: uploadSession.id,
    }));
  }

  public async failClaimedProcessing(
    actor: Actor,
    uploadSession: MediaUploadSessionRecord,
    errorCode: string,
  ): Promise<void> {
    const human = assertHumanActor(actor);
    if (uploadSession.ownerUserId !== human.userId || uploadSession.processingToken === null) return;
    await this.unitOfWork.transaction(({ uploadSessions }) => uploadSessions.markFailed({
      ownerUserId: uploadSession.ownerUserId,
      uploadSessionId: uploadSession.id,
      processingToken: uploadSession.processingToken!,
      errorCode,
      finishedAt: this.clock.now(),
    }));
  }
}
