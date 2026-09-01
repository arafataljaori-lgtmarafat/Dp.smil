import { Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';

import type {
  AuditEventRecord,
  AuditRepositoryPort,
  VideoExportRepositoryPort,
  CaseRecord,
  CaseRepositoryPort,
  CreationAssetBindingRecord,
  CreationDocumentRepositoryPort,
  CreationDraftRecord,
  CreationProjectRecord,
  CreationRevisionAssetRecord,
  CreationRevisionRecord,
  GenerationJobRecord,
  GenerationRepositoryPort,
  GenerationVersionRecord,
  MediaAssetRecord,
  MediaRepositoryPort,
  MediaUploadSessionRecord,
  MediaUploadSessionRepositoryPort,
  ProjectRepositoryPort,
  TransactionPorts,
  UnitOfWorkPort,
} from '@dentpilot/application';

import { PrismaService } from './prisma.service.js';

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

const toCaseRecord = (value: {
  id: string;
  ownerUserId: string;
  displayLabel: string;
  referenceCode: string | null;
  status: 'active' | 'archived';
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}): CaseRecord => value;

const toMediaRecord = (value: {
  id: string;
  ownerUserId: string;
  caseId: string;
  kind: 'source' | 'derived' | 'generated';
  purpose: 'source_photo' | 'mock_simulation_result';
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
  storageKey: string;
  sourceMediaId: string | null;
  createdAt: Date;
  createdById: string;
}): MediaAssetRecord => value;

const toProjectRecord = (value: {
  id: string;
  ownerUserId: string;
  caseId: string;
  type: 'smile_simulation' | 'before_after_image' | 'before_after_video';
  sourceMediaId: string;
  createdAt: Date;
  createdById: string;
  idempotencyKey: string | null;
  requestFingerprint: string | null;
}): CreationProjectRecord => value;

const toCreationBindingRecord = (value: {
  projectId: string;
  ownerUserId: string;
  caseId: string;
  bindingKey: string;
  mediaId: string;
}): CreationAssetBindingRecord => ({ ...value, bindingKey: value.bindingKey as CreationAssetBindingRecord['bindingKey'] });

const toCreationDraftRecord = (value: {
  projectId: string;
  ownerUserId: string;
  caseId: string;
  schemaVersion: number;
  document: Prisma.JsonValue;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}): CreationDraftRecord => ({
  ...value,
  schemaVersion: value.schemaVersion as 1,
  document: value.document as CreationDraftRecord['document'],
});

const toCreationRevisionRecord = (value: {
  id: string;
  ownerUserId: string;
  caseId: string;
  projectId: string;
  revisionNumber: number;
  documentSchemaVersion: number;
  document: Prisma.JsonValue;
  documentSha256: string;
  createdAt: Date;
}): CreationRevisionRecord => ({
  ...value,
  documentSchemaVersion: value.documentSchemaVersion as 1,
  document: value.document as CreationRevisionRecord['document'],
});

const toCreationRevisionAssetRecord = (value: {
  revisionId: string;
  ownerUserId: string;
  caseId: string;
  projectId: string;
  bindingKey: string;
  mediaId: string;
}): CreationRevisionAssetRecord => ({ ...value, bindingKey: value.bindingKey as CreationRevisionAssetRecord['bindingKey'] });

const toJobRecord = (value: {
  id: string;
  ownerUserId: string;
  caseId: string;
  projectId: string;
  sourceMediaId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  generationContractVersion: string;
  correlationId: string;
  providerKey: string;
  status: 'queued' | 'processing' | 'succeeded' | 'failed' | 'cancelled';
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  errorCode: string | null;
}): GenerationJobRecord => value;

const toUploadSessionRecord = (value: {
  id: string;
  ownerUserId: string;
  caseId: string;
  idempotencyKey: string;
  status: 'created' | 'processing' | 'committed' | 'failed' | 'expired';
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  expiresAt: Date;
  processingToken: string | null;
  targetMediaId: string | null;
  targetStorageKey: string | null;
  committedMediaId: string | null;
  errorCode: string | null;
  storageCleanupPending: boolean;
}): MediaUploadSessionRecord => value;

const toVersionRecord = (value: {
  id: string;
  ownerUserId: string;
  generationJobId: string;
  mediaAssetId: string;
  caseId: string;
  projectId: string;
  versionNumber: number;
  sourceMediaId: string;
  sourceSha256: string;
  providerKey: string;
  providerVersion: string;
  generationContractVersion: string;
  parameters: Prisma.JsonValue;
  createdAt: Date;
}): GenerationVersionRecord => ({
  ...value,
  parameters: value.parameters as GenerationVersionRecord['parameters'],
});

class PrismaPorts implements TransactionPorts {
  public readonly cases: CaseRepositoryPort;
  public readonly media: MediaRepositoryPort;
  public readonly projects: ProjectRepositoryPort;
  public readonly creations: CreationDocumentRepositoryPort;
  public readonly generations: GenerationRepositoryPort;
  public readonly uploadSessions: MediaUploadSessionRepositoryPort;
  public readonly audits: AuditRepositoryPort;

    public readonly videoExports: VideoExportRepositoryPort;

  public constructor(private readonly client: PrismaExecutor) {
    this.cases = {
      create: async (input) =>
        toCaseRecord(
          await this.client.patientCase.create({
            data: input,
          }),
        ),
      listByOwner: async (ownerUserId) =>
        (await this.client.patientCase.findMany({
          where: { ownerUserId },
          orderBy: { createdAt: 'desc' },
        })).map(toCaseRecord),
      findById: async (ownerUserId, caseId) => {
        const record = await this.client.patientCase.findFirst({
          where: { id: caseId, ownerUserId },
        });
        return record === null ? null : toCaseRecord(record);
      },
    };

    this.media = {
      create: async (input) =>
        toMediaRecord(
          await this.client.mediaAsset.create({
            data: input,
          }),
        ),
      findById: async (ownerUserId, mediaId) => {
        const record = await this.client.mediaAsset.findFirst({
          where: { id: mediaId, ownerUserId },
        });
        return record === null ? null : toMediaRecord(record);
      },
      findByStorageKey: async (ownerUserId, caseId, storageKey) => {
        const record = await this.client.mediaAsset.findFirst({
          where: { ownerUserId, caseId, storageKey },
        });
        return record === null ? null : toMediaRecord(record);
      },
      listByCase: async (ownerUserId, caseId) =>
        (await this.client.mediaAsset.findMany({
          where: { ownerUserId, caseId },
          orderBy: { createdAt: 'asc' },
        })).map(toMediaRecord),
    };

    this.uploadSessions = {
      createOrFindByIdempotency: async (input) => {
        const inserted = await this.client.$queryRaw<Array<{
          id: string;
          ownerUserId: string;
          caseId: string;
          idempotencyKey: string;
          status: 'created' | 'processing' | 'committed' | 'failed' | 'expired';
          createdAt: Date;
          startedAt: Date | null;
          finishedAt: Date | null;
          expiresAt: Date;
          processingToken: string | null;
          targetMediaId: string | null;
          targetStorageKey: string | null;
          committedMediaId: string | null;
          errorCode: string | null;
          storageCleanupPending: boolean;
        }>>(Prisma.sql`
          INSERT INTO "media_upload_sessions" (
            "id", "ownerUserId", "caseId", "idempotencyKey", "status",
            "createdAt", "expiresAt"
          ) VALUES (
            ${input.id}::uuid, ${input.ownerUserId}::uuid, ${input.caseId}::uuid,
            ${input.idempotencyKey}, ${input.status}::"MediaUploadSessionStatus",
            ${input.createdAt}, ${input.expiresAt}
          )
          ON CONFLICT ("ownerUserId", "caseId", "idempotencyKey") DO NOTHING
          RETURNING
            "id", "ownerUserId", "caseId", "idempotencyKey", "status",
            "createdAt", "startedAt", "finishedAt", "expiresAt", "processingToken",
            "targetMediaId", "targetStorageKey", "committedMediaId", "errorCode", "storageCleanupPending"
        `);
        const created = inserted.at(0);
        if (created !== undefined) return { session: toUploadSessionRecord(created), created: true };
        const existing = await this.client.mediaUploadSession.findFirstOrThrow({
          where: {
            ownerUserId: input.ownerUserId,
            caseId: input.caseId,
            idempotencyKey: input.idempotencyKey,
          },
        });
        return { session: toUploadSessionRecord(existing), created: false };
      },
      findById: async (ownerUserId, uploadSessionId) => {
        const record = await this.client.mediaUploadSession.findFirst({
          where: { id: uploadSessionId, ownerUserId },
        });
        return record === null ? null : toUploadSessionRecord(record);
      },
      claimForProcessing: async (input) => {
        const result = await this.client.mediaUploadSession.updateMany({
          where: {
            id: input.uploadSessionId,
            ownerUserId: input.ownerUserId,
            status: 'created',
            expiresAt: { gt: input.now },
          },
          data: {
            status: 'processing',
            startedAt: input.startedAt,
            processingToken: input.processingToken,
            targetMediaId: input.targetMediaId,
            targetStorageKey: input.targetStorageKey,
          },
        });
        if (result.count !== 1) return null;
        return toUploadSessionRecord(await this.client.mediaUploadSession.findFirstOrThrow({
          where: { id: input.uploadSessionId, ownerUserId: input.ownerUserId },
        }));
      },
      markCommitted: async (input) => {
        const result = await this.client.mediaUploadSession.updateMany({
          where: {
            id: input.uploadSessionId,
            ownerUserId: input.ownerUserId,
            status: 'processing',
            processingToken: input.processingToken,
          },
          data: {
            status: 'committed',
            finishedAt: input.finishedAt,
            committedMediaId: input.committedMediaId,
            errorCode: null,
            storageCleanupPending: false,
          },
        });
        if (result.count !== 1) return null;
        return toUploadSessionRecord(await this.client.mediaUploadSession.findFirstOrThrow({
          where: { id: input.uploadSessionId, ownerUserId: input.ownerUserId },
        }));
      },
      markFailed: async (input) => {
        const result = await this.client.mediaUploadSession.updateMany({
          where: {
            id: input.uploadSessionId,
            ownerUserId: input.ownerUserId,
            status: 'processing',
            processingToken: input.processingToken,
          },
          data: { status: 'failed', finishedAt: input.finishedAt, errorCode: input.errorCode, storageCleanupPending: true },
        });
        if (result.count !== 1) return null;
        return toUploadSessionRecord(await this.client.mediaUploadSession.findFirstOrThrow({
          where: { id: input.uploadSessionId, ownerUserId: input.ownerUserId },
        }));
      },
      markExpired: async (input) => {
        const result = await this.client.mediaUploadSession.updateMany({
          where: {
            id: input.uploadSessionId,
            ownerUserId: input.ownerUserId,
            status: 'created',
            expiresAt: { lte: input.now },
          },
          data: { status: 'expired', finishedAt: input.finishedAt },
        });
        if (result.count !== 1) return null;
        return toUploadSessionRecord(await this.client.mediaUploadSession.findFirstOrThrow({
          where: { id: input.uploadSessionId, ownerUserId: input.ownerUserId },
        }));
      },
      markProcessingTimedOut: async (input) => {
        const result = await this.client.mediaUploadSession.updateMany({
          where: {
            id: input.uploadSessionId,
            ownerUserId: input.ownerUserId,
            status: 'processing',
            processingToken: input.processingToken,
            startedAt: { lte: input.processingStartedBefore },
          },
          data: {
            status: 'failed',
            finishedAt: input.finishedAt,
            errorCode: 'UPLOAD_PROCESSING_TIMEOUT',
            storageCleanupPending: true,
          },
        });
        if (result.count !== 1) return null;
        return toUploadSessionRecord(await this.client.mediaUploadSession.findFirstOrThrow({
          where: { id: input.uploadSessionId, ownerUserId: input.ownerUserId },
        }));
      },
      listExpiredCreated: async (now, limit) =>
        (await this.client.mediaUploadSession.findMany({
          where: { status: 'created', expiresAt: { lte: now } },
          orderBy: { expiresAt: 'asc' },
          take: limit,
        })).map(toUploadSessionRecord),
      listTimedOutProcessing: async (processingStartedBefore, limit) =>
        (await this.client.mediaUploadSession.findMany({
          where: { status: 'processing', startedAt: { lte: processingStartedBefore } },
          orderBy: { startedAt: 'asc' },
          take: limit,
        })).map(toUploadSessionRecord),
      listCleanupPending: async (limit) =>
        (await this.client.mediaUploadSession.findMany({
          where: { status: 'failed', storageCleanupPending: true, targetStorageKey: { not: null }, committedMediaId: null },
          orderBy: { finishedAt: 'asc' },
          take: limit,
        })).map(toUploadSessionRecord),
      markStorageCleanupComplete: async (input) => {
        const result = await this.client.mediaUploadSession.updateMany({
          where: { id: input.uploadSessionId, ownerUserId: input.ownerUserId, status: 'failed', storageCleanupPending: true, committedMediaId: null },
          data: { storageCleanupPending: false },
        });
        if (result.count !== 1) return null;
        return toUploadSessionRecord(await this.client.mediaUploadSession.findFirstOrThrow({
          where: { id: input.uploadSessionId, ownerUserId: input.ownerUserId },
        }));
      },
    };

    this.projects = {
      create: async (input) =>
        toProjectRecord(
          await this.client.creationProject.create({
            data: input,
          }),
        ),
      createOrFindByIdempotency: async (input) => {
        // Same DB-enforced pattern as generations.createOrFindByIdempotency and
        // uploadSessions.createOrFindByIdempotency: a single INSERT ... ON CONFLICT DO
        // NOTHING against the real unique constraint (ownerUserId, idempotencyKey) —
        // owner-scoped, not case-scoped, per the Phase 5 Stage 2 Final Integrity
        // corrective migration. The request fingerprint already encodes caseId, so a key
        // reused against a different case/request produces IdempotencyConflictError (not
        // a second graph) in the service layer. Exactly one concurrent caller ever gets a
        // returned row; every other caller falls through to the SELECT and observes
        // whichever row won — there is no application-level find-then-insert race.
        const inserted = await this.client.$queryRaw<Array<{
          id: string;
          ownerUserId: string;
          caseId: string;
          type: 'smile_simulation' | 'before_after_image' | 'before_after_video';
          sourceMediaId: string;
          createdAt: Date;
          createdById: string;
          idempotencyKey: string | null;
          requestFingerprint: string | null;
        }>>(Prisma.sql`
          INSERT INTO "creation_projects" (
            "id", "ownerUserId", "caseId", "type", "sourceMediaId", "createdAt", "createdById",
            "idempotencyKey", "requestFingerprint"
          ) VALUES (
            ${input.id}::uuid, ${input.ownerUserId}::uuid, ${input.caseId}::uuid,
            ${input.type}::"CreationProjectType", ${input.sourceMediaId}::uuid, ${input.createdAt}, ${input.createdById}::uuid,
            ${input.idempotencyKey}, ${input.requestFingerprint}
          )
          ON CONFLICT ("ownerUserId", "idempotencyKey") DO NOTHING
          RETURNING
            "id", "ownerUserId", "caseId", "type", "sourceMediaId", "createdAt", "createdById",
            "idempotencyKey", "requestFingerprint"
        `);
        const created = inserted.at(0);
        if (created !== undefined) return { project: toProjectRecord(created), created: true };
        const existing = await this.client.creationProject.findFirstOrThrow({
          where: {
            ownerUserId: input.ownerUserId,
            idempotencyKey: input.idempotencyKey,
          },
        });
        return { project: toProjectRecord(existing), created: false };
      },
      findById: async (ownerUserId, projectId) => {
        const record = await this.client.creationProject.findFirst({
          where: { id: projectId, ownerUserId },
        });
        return record === null ? null : toProjectRecord(record);
      },
      listByCase: async (ownerUserId, caseId) =>
        (await this.client.creationProject.findMany({
          where: { ownerUserId, caseId },
          orderBy: { createdAt: 'asc' },
        })).map(toProjectRecord),
    };

    this.creations = {
      createDraft: async (input) => toCreationDraftRecord(await this.client.creationDraft.create({
        data: { ...input, document: input.document },
      })),
      findDraft: async (ownerUserId, projectId) => {
        const record = await this.client.creationDraft.findFirst({ where: { ownerUserId, projectId } });
        return record === null ? null : toCreationDraftRecord(record);
      },
      updateDraftIfRevision: async (input) => {
        const updated = await this.client.$queryRaw<Array<{
          projectId: string; ownerUserId: string; caseId: string; schemaVersion: number; document: Prisma.JsonValue; revision: number; createdAt: Date; updatedAt: Date;
        }>>(Prisma.sql`
          UPDATE "creation_drafts"
          SET "document" = ${input.document}, "schemaVersion" = 1, "revision" = "revision" + 1, "updatedAt" = ${input.updatedAt}
          WHERE "ownerUserId" = ${input.ownerUserId}::uuid AND "projectId" = ${input.projectId}::uuid AND "revision" = ${input.expectedRevision}
          RETURNING "projectId", "ownerUserId", "caseId", "schemaVersion", "document", "revision", "createdAt", "updatedAt"
        `);
        const record = updated.at(0);
        return record === undefined ? null : toCreationDraftRecord(record);
      },
      listBindings: async (ownerUserId, projectId) =>
        (await this.client.creationAssetBinding.findMany({
          where: { ownerUserId, projectId }, orderBy: { bindingKey: 'asc' },
        })).map(toCreationBindingRecord),
      replaceBindings: async (input) => {
        await this.client.creationAssetBinding.deleteMany({ where: { ownerUserId: input.ownerUserId, projectId: input.projectId } });
        if (input.bindings.length > 0) {
          await this.client.creationAssetBinding.createMany({
            data: input.bindings.map((binding) => ({ ...binding })),
          });
        }
        return (await this.client.creationAssetBinding.findMany({
          where: { ownerUserId: input.ownerUserId, projectId: input.projectId }, orderBy: { bindingKey: 'asc' },
        })).map(toCreationBindingRecord);
      },
      replaceBindingsIfRevision: async (input) => {
        // Binding/document single-truth invariant (Phase 5 Stage 2): when `document` is
        // supplied (video projects), it is written by this exact statement — the same
        // WHERE revision = expectedRevision compare-and-swap that claims the revision
        // bump — so the relational bindings this call is about to replace below and the
        // video document's assetBindings can never be observed out of sync.
        const claimed = await this.client.creationDraft.updateMany({
          where: {
            projectId: input.projectId,
            ownerUserId: input.ownerUserId,
            caseId: input.caseId,
            revision: input.expectedRevision,
          },
          data: {
            revision: { increment: 1 },
            updatedAt: input.updatedAt,
            ...(input.document !== undefined ? { document: input.document, schemaVersion: 1 } : {}),
          },
        });
        if (claimed.count !== 1) return null;
        await this.client.creationAssetBinding.deleteMany({
          where: { ownerUserId: input.ownerUserId, projectId: input.projectId },
        });
        await this.client.creationAssetBinding.createMany({
          data: input.bindings.map((binding) => ({ ...binding })),
        });
        const [draft, bindings] = await Promise.all([
          this.client.creationDraft.findFirstOrThrow({
            where: { ownerUserId: input.ownerUserId, caseId: input.caseId, projectId: input.projectId },
          }),
          this.client.creationAssetBinding.findMany({
            where: { ownerUserId: input.ownerUserId, caseId: input.caseId, projectId: input.projectId },
            orderBy: { bindingKey: 'asc' },
          }),
        ]);
        return { draft: toCreationDraftRecord(draft), bindings: bindings.map(toCreationBindingRecord) };
      },
      createRevision: async (input) => {
        const claimed = await this.client.creationDraft.updateMany({
          where: {
            projectId: input.revision.projectId,
            ownerUserId: input.revision.ownerUserId,
            caseId: input.revision.caseId,
            revision: input.expectedDraftRevision,
          },
          data: { revision: { increment: 1 }, updatedAt: input.revision.createdAt },
        });
        if (claimed.count !== 1) return null;
        const revision = await this.client.creationRevision.create({
          data: { ...input.revision, document: input.revision.document },
        });
        const bindings = await this.client.creationAssetBinding.findMany({
          where: {
            ownerUserId: input.revision.ownerUserId,
            caseId: input.revision.caseId,
            projectId: input.revision.projectId,
            bindingKey: { in: [...input.requiredBindingKeys] },
          },
        });
        if (bindings.length !== input.requiredBindingKeys.length) return null;
        if (bindings.length > 0) {
          await this.client.creationRevisionAsset.createMany({
            data: bindings.map((binding) => ({
              revisionId: revision.id,
              ownerUserId: binding.ownerUserId,
              caseId: binding.caseId,
              projectId: binding.projectId,
              bindingKey: binding.bindingKey,
              mediaId: binding.mediaId,
            })),
          });
        }
        return toCreationRevisionRecord(revision);
      },
      listRevisions: async (ownerUserId, projectId) =>
        (await this.client.creationRevision.findMany({
          where: { ownerUserId, projectId }, orderBy: { revisionNumber: 'asc' },
        })).map(toCreationRevisionRecord),
      findRevision: async (ownerUserId, projectId, revisionId) => {
        const record = await this.client.creationRevision.findFirst({ where: { id: revisionId, ownerUserId, projectId } });
        return record === null ? null : toCreationRevisionRecord(record);
      },
      listRevisionAssets: async (ownerUserId, revisionId) =>
        (await this.client.creationRevisionAsset.findMany({
          where: { ownerUserId, revisionId }, orderBy: { bindingKey: 'asc' },
        })).map(toCreationRevisionAssetRecord),
    };

    this.generations = {
      createOrFindByIdempotency: async (input) => {
        const inserted = await this.client.$queryRaw<Array<{
          id: string;
          ownerUserId: string;
          caseId: string;
          projectId: string;
          sourceMediaId: string;
          idempotencyKey: string;
          requestFingerprint: string;
          generationContractVersion: string;
          correlationId: string;
          providerKey: string;
          status: 'queued' | 'processing' | 'succeeded' | 'failed' | 'cancelled';
          createdAt: Date;
          startedAt: Date | null;
          finishedAt: Date | null;
          errorCode: string | null;
        }>>(Prisma.sql`
          INSERT INTO "generation_jobs" (
            "id", "ownerUserId", "caseId", "projectId", "sourceMediaId",
            "idempotencyKey", "requestFingerprint", "generationContractVersion",
            "correlationId", "providerKey", "status", "createdAt", "startedAt",
            "finishedAt", "errorCode"
          ) VALUES (
            ${input.id}::uuid, ${input.ownerUserId}::uuid, ${input.caseId}::uuid,
            ${input.projectId}::uuid, ${input.sourceMediaId}::uuid,
            ${input.idempotencyKey}, ${input.requestFingerprint},
            ${input.generationContractVersion}, ${input.correlationId}, ${input.providerKey},
            ${input.status}::"GenerationStatus", ${input.createdAt}, ${input.startedAt},
            ${input.finishedAt}, ${input.errorCode}
          )
          ON CONFLICT ("ownerUserId", "projectId", "idempotencyKey") DO NOTHING
          RETURNING
            "id", "ownerUserId", "caseId", "projectId", "sourceMediaId",
            "idempotencyKey", "requestFingerprint", "generationContractVersion",
            "correlationId", "providerKey", "status", "createdAt", "startedAt",
            "finishedAt", "errorCode"
        `);
        const created = inserted.at(0);
        if (created !== undefined) {
          return { job: toJobRecord(created), created: true };
        }
        const existing = await this.client.generationJob.findFirstOrThrow({
          where: {
            ownerUserId: input.ownerUserId,
            projectId: input.projectId,
            idempotencyKey: input.idempotencyKey,
          },
        });
        return { job: toJobRecord(existing), created: false };
      },
      findById: async (ownerUserId, jobId) => {
        const record = await this.client.generationJob.findFirst({
          where: { id: jobId, ownerUserId },
        });
        return record === null ? null : toJobRecord(record);
      },
      listByCase: async (ownerUserId, caseId) =>
        (await this.client.generationJob.findMany({
          where: { ownerUserId, caseId },
          orderBy: { createdAt: 'desc' },
        })).map(toJobRecord),
      claimForProcessing: async (ownerUserId, jobId, startedAt) => {
        const result = await this.client.generationJob.updateMany({
          where: { id: jobId, ownerUserId, status: 'queued' },
          data: { status: 'processing', startedAt },
        });
        return result.count === 1;
      },
      complete: async (ownerUserId, jobId, finishedAt) => {
        const result = await this.client.generationJob.updateMany({
          where: { id: jobId, ownerUserId, status: 'processing' },
          data: { status: 'succeeded', finishedAt, errorCode: null },
        });
        if (result.count !== 1) {
          return null;
        }
        const record = await this.client.generationJob.findFirstOrThrow({
          where: { id: jobId, ownerUserId },
        });
        return toJobRecord(record);
      },
      fail: async (ownerUserId, jobId, finishedAt, errorCode) => {
        const result = await this.client.generationJob.updateMany({
          where: { id: jobId, ownerUserId, status: 'processing' },
          data: { status: 'failed', finishedAt, errorCode },
        });
        if (result.count !== 1) {
          return null;
        }
        const record = await this.client.generationJob.findFirstOrThrow({
          where: { id: jobId, ownerUserId },
        });
        return toJobRecord(record);
      },
      createVersion: async (input) =>
        toVersionRecord(
          await this.client.generationVersion.create({
            data: input,
          }),
        ),
      findVersionByJob: async (ownerUserId, jobId) => {
        const record = await this.client.generationVersion.findFirst({
          where: { ownerUserId, generationJobId: jobId },
          orderBy: { versionNumber: 'desc' },
        });
        return record === null ? null : toVersionRecord(record);
      },
    };

    
      this.videoExports = {
        insertJobAndVersion: async () => {},
        findJobByFingerprint: async () => null,
        findById: async () => null,
        findLatestVersion: async () => null,
        updateJobStatus: async () => {},
        updateVersionStatus: async () => {},
        attachMediaToVersion: async () => {},
      };
      this.audits = {
      append: async (input) => {
        await this.client.auditEvent.create({
          data: {
            ...input,
            metadata: { ...input.metadata },
          },
        });
      },
      listByCase: async (ownerUserId, caseId) =>
        (await this.client.auditEvent.findMany({
          where: { ownerUserId, caseId },
          orderBy: { occurredAt: 'desc' },
        })).map((event) => ({
          id: event.id,
          ownerUserId: event.ownerUserId,
          actorType: event.actorType,
          actorUserId: event.actorUserId,
          systemActorKey: event.systemActorKey,
          eventType: event.eventType as AuditEventRecord['eventType'],
          caseId: event.caseId,
          projectId: event.projectId,
          generationJobId: event.generationJobId,
          occurredAt: event.occurredAt,
          correlationId: event.correlationId,
          metadata: event.metadata as AuditEventRecord['metadata'],
        })),
    };
  }
}

@Injectable()
export class PrismaUnitOfWork extends PrismaPorts implements UnitOfWorkPort {
  public constructor(private readonly prisma: PrismaService) {
    super(prisma);
  }

  public async transaction<T>(work: (ports: TransactionPorts) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (transaction) => work(new PrismaPorts(transaction)));
  }
}
