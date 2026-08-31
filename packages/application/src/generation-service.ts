import {
  GenerationError,
  IdempotencyConflictError,
  NotFoundError,
  SourceIntegrityMismatchError,
  ValidationError,
  assertCompleteProvenance,
  assertGeneratedAssetProvenance,
  assertIdempotencyKey,
  actorAuditShape,
  assertHumanActor,
  assertSystemActor,
  ownerUserIdForActor,
  smileSimulationGenerationContractVersion,
  type GenerationFailureCode,
} from '@dentpilot/domain';

import { generatedMediaStorageKey } from './object-storage-keys.js';
import { collectStreamWithinLimit } from './ports.js';
import type {
  Actor,
  ClockPort,
  DigestPort,
  GenerationJobRecord,
  GenerationQueueMessage,
  GenerationQueuePort,
  IdGeneratorPort,
  ObjectStoragePort,
  SmileSimulationProviderPort,
  UnitOfWorkPort,
} from './ports.js';

async function* bytesAsStream(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  await Promise.resolve();
  yield bytes;
}

class GenerationWorkerFailure extends Error {
  public constructor(
    public readonly failureCode: GenerationFailureCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'GenerationWorkerFailure';
  }
}

function canonicalRequestPayload(input: {
  readonly ownerUserId: string;
  readonly projectId: string;
  readonly sourceMediaId: string;
  readonly sourceMediaSha256: string;
  readonly providerKey: string;
  readonly generationContractVersion: string;
}): string {
  return JSON.stringify({
    ownerUserId: input.ownerUserId,
    generationContractVersion: input.generationContractVersion,
    generationType: 'smile_simulation',
    projectId: input.projectId,
    providerKey: input.providerKey,
    sourceMediaId: input.sourceMediaId,
    sourceMediaSha256: input.sourceMediaSha256,
  });
}

export class GenerationService {
  public constructor(
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly storage: ObjectStoragePort,
    private readonly digest: DigestPort,
    private readonly queue: GenerationQueuePort,
    private readonly provider: SmileSimulationProviderPort,
    private readonly ids: IdGeneratorPort,
    private readonly clock: ClockPort,
    private readonly streamCollectionMaxBytes: number,
  ) {}

  public async request(
    actor: Actor,
    input: { readonly projectId: string; readonly idempotencyKey: string },
  ): Promise<{ readonly id: string; readonly created: boolean }> {
    const human = assertHumanActor(actor);
    const ownerUserId = ownerUserIdForActor(human);
    const idempotencyKey = assertIdempotencyKey(input.idempotencyKey);
    const project = await this.unitOfWork.projects.findById(ownerUserId, input.projectId);
    if (project === null) {
      throw new NotFoundError(`Project ${input.projectId} was not found for the current user.`);
    }
    if (project.type !== 'smile_simulation') {
      throw new ValidationError('Only smile simulation projects are supported by the Phase 1 mock.');
    }
    const sourceMedia = await this.unitOfWork.media.findById(ownerUserId, project.sourceMediaId);
    if (sourceMedia === null || sourceMedia.kind !== 'source') {
      throw new NotFoundError('The project source media was not found for the current user.');
    }

    const requestFingerprint = await this.digest.sha256(
      new TextEncoder().encode(
        canonicalRequestPayload({
          ownerUserId,
          projectId: project.id,
          sourceMediaId: sourceMedia.id,
          sourceMediaSha256: sourceMedia.sha256,
          providerKey: this.provider.key,
          generationContractVersion: smileSimulationGenerationContractVersion,
        }),
      ),
    );
    const now = this.clock.now();
    const candidateJobId = this.ids.next();
    const result = await this.unitOfWork.transaction(async ({ generations, audits }) => {
      const created = await generations.createOrFindByIdempotency({
        id: candidateJobId,
        ownerUserId,
        caseId: project.caseId,
        projectId: project.id,
        sourceMediaId: project.sourceMediaId,
        idempotencyKey,
        requestFingerprint,
        generationContractVersion: smileSimulationGenerationContractVersion,
        correlationId: human.requestId,
        providerKey: this.provider.key,
        status: 'queued',
        createdAt: now,
        startedAt: null,
        finishedAt: null,
        errorCode: null,
      });
      if (created.job.requestFingerprint !== requestFingerprint) {
        throw new IdempotencyConflictError('Idempotency key was reused with a different logical request.');
      }
      if (created.created) {
        await audits.append({
          id: this.ids.next(),
          ownerUserId,
          ...actorAuditShape(human),
          eventType: 'GenerationRequested',
          caseId: project.caseId,
          projectId: project.id,
          generationJobId: created.job.id,
          occurredAt: now,
          correlationId: human.requestId,
          metadata: {
            generationContractVersion: smileSimulationGenerationContractVersion,
            providerKey: this.provider.key,
            requestFingerprint,
          },
        });
      }
      return created;
    });

    if (result.created) {
      await this.queue.enqueue({
        schemaVersion: 1,
        jobId: result.job.id,
        ownerUserId: result.job.ownerUserId,
        correlationId: result.job.correlationId,
      });
    }
    return { id: result.job.id, created: result.created };
  }

  public async get(actor: Actor, jobId: string) {
    const ownerUserId = ownerUserIdForActor(actor);
    const job = await this.unitOfWork.generations.findById(ownerUserId, jobId);
    if (job === null) {
      throw new NotFoundError(`Generation job ${jobId} was not found for the current user.`);
    }
    const version = await this.unitOfWork.generations.findVersionByJob(ownerUserId, jobId);
    return { job, version };
  }

  public async process(message: GenerationQueueMessage, systemActor: Actor): Promise<void> {
    const system = assertSystemActor(systemActor);
    this.assertQueueMessage(message, system);
    const startedAt = this.clock.now();
    const jobBeforeClaim = await this.unitOfWork.generations.findById(message.ownerUserId, message.jobId);
    if (jobBeforeClaim === null || jobBeforeClaim.correlationId !== message.correlationId) {
      return;
    }
    const claimed = await this.unitOfWork.transaction(async ({ generations, audits }) => {
      const didClaim = await generations.claimForProcessing(message.ownerUserId, message.jobId, startedAt);
      if (didClaim) {
        await audits.append({
          id: this.ids.next(),
          ownerUserId: message.ownerUserId,
          ...actorAuditShape(system),
          eventType: 'GenerationStarted',
          caseId: jobBeforeClaim.caseId,
          projectId: jobBeforeClaim.projectId,
          generationJobId: message.jobId,
          occurredAt: startedAt,
          correlationId: message.correlationId,
          metadata: { providerKey: jobBeforeClaim.providerKey },
        });
      }
      return didClaim;
    });
    if (!claimed) {
      return;
    }

    let generatedStorageKey: string | null = null;
    try {
      const sourceMedia = await this.unitOfWork.media.findById(message.ownerUserId, jobBeforeClaim.sourceMediaId);
      if (sourceMedia === null || sourceMedia.kind !== 'source') {
        throw new GenerationWorkerFailure('SOURCE_NOT_FOUND', 'Generation source media cannot be used.');
      }
      let sourceBytes: Uint8Array;
      try {
        const sourceObject = await this.storage.getStream(sourceMedia.storageKey);
        if (sourceObject.contentLength > this.streamCollectionMaxBytes) {
          throw new Error('Stored source exceeds the configured collection limit.');
        }
        sourceBytes = await collectStreamWithinLimit(sourceObject.body, this.streamCollectionMaxBytes);
      } catch (cause) {
        throw new GenerationWorkerFailure('STORAGE_READ_FAILED', 'Generation source could not be read.', cause);
      }
      const currentSourceSha256 = await this.digest.sha256(sourceBytes);
      if (currentSourceSha256 !== sourceMedia.sha256) {
        throw new SourceIntegrityMismatchError('Source media checksum no longer matches the immutable record.');
      }
      let providerOutput: Awaited<ReturnType<SmileSimulationProviderPort['generate']>>;
      try {
        providerOutput = await this.provider.generate({
          sourceBytes,
          sourceMimeType: sourceMedia.mimeType,
          sourceSha256: sourceMedia.sha256,
          sourceMediaId: sourceMedia.id,
          generationContractVersion: jobBeforeClaim.generationContractVersion,
          correlationId: message.correlationId,
        });
      } catch (cause) {
        throw new GenerationWorkerFailure('PROVIDER_FAILED', 'Generation provider failed.', cause);
      }
      if (
        providerOutput.bytes.byteLength === 0 ||
        providerOutput.width <= 0 ||
        providerOutput.height <= 0 ||
        providerOutput.mimeType !== 'image/png' ||
        providerOutput.providerVersion.trim().length === 0
      ) {
        throw new GenerationWorkerFailure('OUTPUT_INVALID', 'Generation provider emitted an invalid output.');
      }

      const generatedMediaId = this.ids.next();
      generatedStorageKey = generatedMediaStorageKey(message.ownerUserId, jobBeforeClaim.caseId, generatedMediaId);
      try {
        await this.storage.putStream({
          key: generatedStorageKey,
          body: bytesAsStream(providerOutput.bytes),
          contentType: providerOutput.mimeType,
          contentLength: providerOutput.bytes.byteLength,
        });
      } catch (cause) {
        throw new GenerationWorkerFailure('STORAGE_WRITE_FAILED', 'Generated output could not be stored.', cause);
      }
      const outputStorageKey = generatedStorageKey;
      const outputSha256 = await this.digest.sha256(providerOutput.bytes);
      const versionId = this.ids.next();
      const finishedAt = this.clock.now();
      try {
        assertCompleteProvenance({
          sourceMediaId: sourceMedia.id,
          sourceSha256: sourceMedia.sha256,
          generationJobId: jobBeforeClaim.id,
          providerKey: jobBeforeClaim.providerKey,
          providerVersion: providerOutput.providerVersion,
          generationContractVersion: jobBeforeClaim.generationContractVersion,
          parameters: providerOutput.parameters,
        });
      } catch (cause) {
        throw new GenerationWorkerFailure('OUTPUT_INVALID', 'Generation provider emitted invalid provenance.', cause);
      }

      try {
        await this.unitOfWork.transaction(async ({ media, generations, audits }) => {
        const generatedMedia = await media.create({
          id: generatedMediaId,
          ownerUserId: message.ownerUserId,
          caseId: jobBeforeClaim.caseId,
          kind: 'generated',
          purpose: 'mock_simulation_result',
          mimeType: providerOutput.mimeType,
          byteSize: providerOutput.bytes.byteLength,
          width: providerOutput.width,
          height: providerOutput.height,
          sha256: outputSha256,
          storageKey: outputStorageKey,
          sourceMediaId: sourceMedia.id,
          createdById: jobBeforeClaim.ownerUserId,
        });
        assertGeneratedAssetProvenance({
          media: generatedMedia,
          generationJobId: message.jobId,
          providerKey: jobBeforeClaim.providerKey,
          providerVersion: providerOutput.providerVersion,
        });
        await generations.createVersion({
          id: versionId,
          ownerUserId: message.ownerUserId,
          generationJobId: message.jobId,
          mediaAssetId: generatedMedia.id,
          caseId: jobBeforeClaim.caseId,
          projectId: jobBeforeClaim.projectId,
          versionNumber: 1,
          sourceMediaId: sourceMedia.id,
          sourceSha256: sourceMedia.sha256,
          providerKey: jobBeforeClaim.providerKey,
          providerVersion: providerOutput.providerVersion,
          generationContractVersion: jobBeforeClaim.generationContractVersion,
          parameters: providerOutput.parameters,
          createdAt: finishedAt,
        });
        await audits.append({
          id: this.ids.next(),
          ownerUserId: message.ownerUserId,
          ...actorAuditShape(system),
          eventType: 'GenerationSucceeded',
          caseId: jobBeforeClaim.caseId,
          projectId: jobBeforeClaim.projectId,
          generationJobId: message.jobId,
          occurredAt: finishedAt,
          correlationId: message.correlationId,
          metadata: {
            generatedMediaId,
            generationContractVersion: jobBeforeClaim.generationContractVersion,
            providerVersion: providerOutput.providerVersion,
            versionNumber: 1,
          },
        });
        const completed = await generations.complete(message.ownerUserId, message.jobId, finishedAt);
        if (completed === null) {
          throw new GenerationError('Generation job could not be completed from its current state.');
        }
        });
      } catch (cause) {
        throw new GenerationWorkerFailure('PERSISTENCE_FAILED', 'Generated output could not be persisted.', cause);
      }
    } catch (cause) {
      if (generatedStorageKey !== null) {
        await this.storage.delete(generatedStorageKey).catch(() => undefined);
      }
      await this.markFailed(jobBeforeClaim, system, message.correlationId, this.failureCodeFor(cause));
    }
  }

  private assertQueueMessage(message: GenerationQueueMessage, actor: Actor): void {
    if (
      message.schemaVersion !== 1 ||
      message.jobId.length === 0 ||
      message.ownerUserId.length === 0 ||
      message.correlationId.length === 0 ||
      ownerUserIdForActor(actor) !== message.ownerUserId
    ) {
      throw new ValidationError('Generation queue message is not valid for the worker tenant.');
    }
  }

  private failureCodeFor(cause: unknown): GenerationFailureCode {
    if (cause instanceof GenerationWorkerFailure) return cause.failureCode;
    if (cause instanceof SourceIntegrityMismatchError) return 'SOURCE_INTEGRITY_MISMATCH';
    if (cause instanceof NotFoundError) return 'SOURCE_NOT_FOUND';
    return 'INTERNAL_FAILURE';
  }

  private async markFailed(
    job: Pick<GenerationJobRecord, 'id' | 'ownerUserId' | 'caseId' | 'projectId'>,
    actor: Actor,
    correlationId: string,
    errorCode: GenerationFailureCode,
  ): Promise<void> {
    const finishedAt = this.clock.now();
    await this.unitOfWork.transaction(async ({ generations, audits }) => {
      const ownerUserId = ownerUserIdForActor(actor);
      const failed = await generations.fail(ownerUserId, job.id, finishedAt, errorCode);
      if (failed !== null) {
        await audits.append({
          id: this.ids.next(),
          ownerUserId,
          ...actorAuditShape(actor),
          eventType: 'GenerationFailed',
          caseId: job.caseId,
          projectId: job.projectId,
          generationJobId: job.id,
          occurredAt: finishedAt,
          correlationId,
          metadata: { errorCode },
        });
      }
    });
  }
}
