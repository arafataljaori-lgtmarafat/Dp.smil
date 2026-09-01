
export interface HeadlessRendererPort {
  /** Renders a composition plan to a raw RGBA byte buffer of width x height */
  renderFrame(plan: RenderPlan, width: number, height: number): Promise<Uint8Array>;
}
import type { CreationBindingKey, CreationDocument, VideoCompositionDocument, VideoTemplateDefinition } from '@dentpilot/contracts';
import type {
  ActorContext,
  CreationProjectType,
  GenerationStatus,
  MediaKind,
} from '@dentpilot/domain';

import type { CreationRenderAsset, RenderTarget, RenderPlan } from './composition-engine.js';
import type { VideoRenderPlanAtTime } from './video-composition-engine.js';

export type ProvenanceParameters = Readonly<Record<string, string | number | boolean | null>>;

export interface CaseRecord {
  readonly id: string;
  readonly ownerUserId: string;
  readonly displayLabel: string;
  readonly referenceCode: string | null;
  readonly status: 'active' | 'archived';
  readonly createdById: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface MediaAssetRecord {
  readonly id: string;
  readonly ownerUserId: string;
  readonly caseId: string;
  readonly kind: MediaKind;
  readonly purpose: 'source_photo' | 'mock_simulation_result';
  readonly mimeType: string;
  readonly byteSize: number;
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
  readonly storageKey: string;
  readonly sourceMediaId: string | null;
  readonly createdAt: Date;
  readonly createdById: string;
}

export interface CreationProjectRecord {
  readonly id: string;
  readonly ownerUserId: string;
  readonly caseId: string;
  readonly type: CreationProjectType;
  readonly sourceMediaId: string;
  readonly createdAt: Date;
  readonly createdById: string;
  /**
   * Production-hardened creation idempotency (Phase 5 Stage 2). Null for every project
   * type that does not require idempotent creation (image, smile simulation) — a
   * Postgres unique constraint on (ownerUserId, idempotencyKey) treats every NULL
   * as distinct, so those rows never collide with one another. Populated only by
   * before_after_video creation, the sole caller of
   * ProjectRepositoryPort.createOrFindByIdempotency.
   */
  readonly idempotencyKey: string | null;
  readonly requestFingerprint: string | null;
}

export interface CreationAssetBindingRecord {
  readonly projectId: string;
  readonly ownerUserId: string;
  readonly caseId: string;
  readonly bindingKey: CreationBindingKey;
  readonly mediaId: string;
}

/**
 * `document` safely represents CreationDocumentV1 | VideoCompositionDocumentV1 — see the
 * document routing invariant in creation-service.ts. Which variant a given row holds is
 * always determined by its CreationProject.type, never inferred from this field's shape.
 */
export interface CreationDraftRecord {
  readonly projectId: string;
  readonly ownerUserId: string;
  readonly caseId: string;
  readonly schemaVersion: 1;
  readonly document: CreationDocument | VideoCompositionDocument;
  readonly revision: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreationRevisionRecord {
  readonly id: string;
  readonly ownerUserId: string;
  readonly caseId: string;
  readonly projectId: string;
  readonly revisionNumber: number;
  readonly documentSchemaVersion: 1;
  readonly document: CreationDocument | VideoCompositionDocument;
  readonly documentSha256: string;
  readonly createdAt: Date;
}

export interface CreationRevisionAssetRecord {
  readonly revisionId: string;
  readonly ownerUserId: string;
  readonly caseId: string;
  readonly projectId: string;
  readonly bindingKey: CreationBindingKey;
  readonly mediaId: string;
}

export interface GenerationJobRecord {
  readonly id: string;
  readonly ownerUserId: string;
  readonly caseId: string;
  readonly projectId: string;
  readonly sourceMediaId: string;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly generationContractVersion: string;
  readonly correlationId: string;
  readonly providerKey: string;
  readonly status: GenerationStatus;
  readonly createdAt: Date;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
  readonly errorCode: string | null;
}

export type MediaUploadSessionStatus = 'created' | 'processing' | 'committed' | 'failed' | 'expired';

export interface MediaUploadSessionRecord {
  readonly id: string;
  readonly ownerUserId: string;
  readonly caseId: string;
  readonly idempotencyKey: string;
  readonly status: MediaUploadSessionStatus;
  readonly createdAt: Date;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
  readonly expiresAt: Date;
  readonly processingToken: string | null;
  readonly targetMediaId: string | null;
  readonly targetStorageKey: string | null;
  readonly committedMediaId: string | null;
  readonly errorCode: string | null;
  readonly storageCleanupPending: boolean;
}

export interface GenerationVersionRecord {
  readonly id: string;
  readonly ownerUserId: string;
  readonly generationJobId: string;
  readonly mediaAssetId: string;
  readonly caseId: string;
  readonly projectId: string;
  readonly versionNumber: number;
  readonly sourceMediaId: string;
  readonly sourceSha256: string;
  readonly providerKey: string;
  readonly providerVersion: string;
  readonly generationContractVersion: string;
  readonly parameters: ProvenanceParameters;
  readonly createdAt: Date;
}

export interface AuditEventRecord {
  readonly id: string;
  readonly ownerUserId: string;
  readonly actorType: 'human' | 'system';
  readonly actorUserId: string | null;
  readonly systemActorKey: string | null;
  readonly eventType:
    | 'CaseCreated'
    | 'MediaUploaded'
    | 'CreationProjectCreated'
    | 'CreationBindingChanged'
    | 'CreationRevisionCreated'
    | 'GenerationRequested'
    | 'GenerationStarted'
    | 'GenerationSucceeded'
    | 'GenerationFailed'
    | 'GenerationCancelled';
  readonly caseId: string | null;
  readonly projectId: string | null;
  readonly generationJobId: string | null;
  readonly occurredAt: Date;
  readonly correlationId: string;
  readonly metadata: ProvenanceParameters;
}

export interface CaseRepositoryPort {
  create(input: Omit<CaseRecord, 'createdAt' | 'updatedAt'>): Promise<CaseRecord>;
  listByOwner(ownerUserId: string): Promise<readonly CaseRecord[]>;
  findById(ownerUserId: string, caseId: string): Promise<CaseRecord | null>;
}

export interface MediaRepositoryPort {
  create(input: Omit<MediaAssetRecord, 'createdAt'>): Promise<MediaAssetRecord>;
  findById(ownerUserId: string, mediaId: string): Promise<MediaAssetRecord | null>;
  findByStorageKey(ownerUserId: string, caseId: string, storageKey: string): Promise<MediaAssetRecord | null>;
  listByCase(ownerUserId: string, caseId: string): Promise<readonly MediaAssetRecord[]>;
}

export interface ProjectRepositoryPort {
  create(input: CreationProjectRecord): Promise<CreationProjectRecord>;
  /**
   * Database-enforced creation idempotency (Phase 5 Stage 2): a single INSERT ... ON
   * CONFLICT (ownerUserId, idempotencyKey) DO NOTHING, using the same database-enforced pattern
   * GenerationRepositoryPort.createOrFindByIdempotency and
   * MediaUploadSessionRepositoryPort.createOrFindByIdempotency already use. `created:
   * false` means a project with this owner+key already existed — the caller must
   * still compare `requestFingerprint` and raise IdempotencyConflictError itself on a
   * mismatch; this method never does that comparison.
   */
  createOrFindByIdempotency(input: CreationProjectRecord): Promise<{
    readonly project: CreationProjectRecord;
    readonly created: boolean;
  }>;
  findById(ownerUserId: string, projectId: string): Promise<CreationProjectRecord | null>;
  listByCase(ownerUserId: string, caseId: string): Promise<readonly CreationProjectRecord[]>;
}

export interface CreationDocumentRepositoryPort {
  createDraft(input: CreationDraftRecord): Promise<CreationDraftRecord>;
  findDraft(ownerUserId: string, projectId: string): Promise<CreationDraftRecord | null>;
  updateDraftIfRevision(input: {
    readonly ownerUserId: string;
    readonly projectId: string;
    readonly expectedRevision: number;
    readonly document: CreationDocument | VideoCompositionDocument;
    readonly updatedAt: Date;
  }): Promise<CreationDraftRecord | null>;
  listBindings(ownerUserId: string, projectId: string): Promise<readonly CreationAssetBindingRecord[]>;
  replaceBindings(input: {
    readonly ownerUserId: string;
    readonly caseId: string;
    readonly projectId: string;
    readonly bindings: readonly CreationAssetBindingRecord[];
  }): Promise<readonly CreationAssetBindingRecord[]>;
  replaceBindingsIfRevision(input: {
    readonly ownerUserId: string;
    readonly caseId: string;
    readonly projectId: string;
    readonly expectedRevision: number;
    readonly bindings: readonly CreationAssetBindingRecord[];
    readonly updatedAt: Date;
    /**
     * Binding/document single-truth invariant (Phase 5 Stage 2): when supplied, the
     * draft's `document` column is overwritten in the exact same UPDATE statement (same
     * WHERE revision = expectedRevision CAS) that bumps the revision and replaces the
     * relational bindings, so relational bindings and the video document's assetBindings
     * can never observably diverge. Image callers omit this — image documents never
     * embed mediaId, so an image binding mutation still only bumps the revision.
     */
    readonly document?: CreationDocument | VideoCompositionDocument;
  }): Promise<{ readonly bindings: readonly CreationAssetBindingRecord[]; readonly draft: CreationDraftRecord } | null>;
  createRevision(input: {
    readonly revision: CreationRevisionRecord;
    readonly expectedDraftRevision: number;
    /** Binding keys referenced by the canonical document saved in this immutable revision. */
    readonly requiredBindingKeys: readonly CreationAssetBindingRecord['bindingKey'][];
  }): Promise<CreationRevisionRecord | null>;
  listRevisions(ownerUserId: string, projectId: string): Promise<readonly CreationRevisionRecord[]>;
  findRevision(ownerUserId: string, projectId: string, revisionId: string): Promise<CreationRevisionRecord | null>;
  listRevisionAssets(ownerUserId: string, revisionId: string): Promise<readonly CreationRevisionAssetRecord[]>;
}

export interface GenerationRepositoryPort {
  createOrFindByIdempotency(input: GenerationJobRecord): Promise<{
    readonly job: GenerationJobRecord;
    readonly created: boolean;
  }>;
  findById(ownerUserId: string, jobId: string): Promise<GenerationJobRecord | null>;
  listByCase(ownerUserId: string, caseId: string): Promise<readonly GenerationJobRecord[]>;
  claimForProcessing(ownerUserId: string, jobId: string, startedAt: Date): Promise<boolean>;
  complete(ownerUserId: string, jobId: string, finishedAt: Date): Promise<GenerationJobRecord | null>;
  fail(ownerUserId: string, jobId: string, finishedAt: Date, errorCode: string): Promise<GenerationJobRecord | null>;
  createVersion(input: GenerationVersionRecord): Promise<GenerationVersionRecord>;
  findVersionByJob(ownerUserId: string, jobId: string): Promise<GenerationVersionRecord | null>;
}

export interface MediaUploadSessionRepositoryPort {
  createOrFindByIdempotency(input: Omit<MediaUploadSessionRecord, 'startedAt' | 'finishedAt' | 'processingToken' | 'targetMediaId' | 'targetStorageKey' | 'committedMediaId' | 'errorCode' | 'storageCleanupPending'>): Promise<{
    readonly session: MediaUploadSessionRecord;
    readonly created: boolean;
  }>;
  findById(ownerUserId: string, uploadSessionId: string): Promise<MediaUploadSessionRecord | null>;
  claimForProcessing(input: {
    readonly ownerUserId: string;
    readonly uploadSessionId: string;
    readonly processingToken: string;
    readonly targetMediaId: string;
    readonly targetStorageKey: string;
    readonly startedAt: Date;
    readonly now: Date;
  }): Promise<MediaUploadSessionRecord | null>;
  markCommitted(input: {
    readonly ownerUserId: string;
    readonly uploadSessionId: string;
    readonly processingToken: string;
    readonly committedMediaId: string;
    readonly finishedAt: Date;
  }): Promise<MediaUploadSessionRecord | null>;
  markFailed(input: {
    readonly ownerUserId: string;
    readonly uploadSessionId: string;
    readonly processingToken: string;
    readonly errorCode: string;
    readonly finishedAt: Date;
  }): Promise<MediaUploadSessionRecord | null>;
  /** Expires only a never-claimed `created` session. */
  markExpired(input: {
    readonly ownerUserId: string;
    readonly uploadSessionId: string;
    readonly now: Date;
    readonly finishedAt: Date;
  }): Promise<MediaUploadSessionRecord | null>;
  /** Fails only a timed-out processing session with its active fencing token. */
  markProcessingTimedOut(input: {
    readonly ownerUserId: string;
    readonly uploadSessionId: string;
    readonly processingToken: string;
    readonly processingStartedBefore: Date;
    readonly finishedAt: Date;
  }): Promise<MediaUploadSessionRecord | null>;
  listExpiredCreated(now: Date, limit: number): Promise<readonly MediaUploadSessionRecord[]>;
  listTimedOutProcessing(processingStartedBefore: Date, limit: number): Promise<readonly MediaUploadSessionRecord[]>;
  listCleanupPending(limit: number): Promise<readonly MediaUploadSessionRecord[]>;
  markStorageCleanupComplete(input: { readonly ownerUserId: string; readonly uploadSessionId: string }): Promise<MediaUploadSessionRecord | null>;
}

export interface AuditRepositoryPort {
  append(input: AuditEventRecord): Promise<void>;
  listByCase(ownerUserId: string, caseId: string): Promise<readonly AuditEventRecord[]>;
}

export interface TransactionPorts {
  readonly cases: CaseRepositoryPort;
  readonly media: MediaRepositoryPort;
  readonly projects: ProjectRepositoryPort;
  readonly creations: CreationDocumentRepositoryPort;
  readonly generations: GenerationRepositoryPort;
  readonly uploadSessions: MediaUploadSessionRepositoryPort;
  readonly audits: AuditRepositoryPort;
  readonly videoExports: VideoExportRepositoryPort;
}

export interface UnitOfWorkPort extends TransactionPorts {
  transaction<T>(work: (ports: TransactionPorts) => Promise<T>): Promise<T>;
}

export interface ObjectStorageHead {
  readonly contentLength: number;
  readonly contentType: string | null;
  readonly etag: string | null;
}

export interface ObjectStorageReadResult extends ObjectStorageHead {
  readonly body: AsyncIterable<Uint8Array>;
}

export interface ObjectStoragePutInput {
  readonly key: string;
  readonly body: AsyncIterable<Uint8Array>;
  readonly contentType: string;
  readonly contentLength?: number;
}

export interface ObjectStoragePort {
  putStream(input: ObjectStoragePutInput): Promise<void>;
  getStream(key: string): Promise<ObjectStorageReadResult>;
  head(key: string): Promise<ObjectStorageHead>;
  delete(key: string): Promise<void>;
  probeReadiness(): Promise<void>;
}

/**
 * Compatibility bridge for byte-oriented consumers. New ingest paths must not use this helper
 * to accept request payloads; Phase 3B will stream validation and finalization end-to-end.
 */
export async function collectStreamWithinLimit(
  body: AsyncIterable<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError('The stream collection limit must be a positive safe integer.');
  }
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  for await (const chunk of body) {
    totalBytes += chunk.byteLength;
    if (totalBytes > maxBytes) {
      throw new RangeError('The stream exceeded the configured collection limit.');
    }
    chunks.push(chunk);
  }
  const collected = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    collected.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return collected;
}

export interface DigestPort {
  sha256(bytes: Uint8Array): Promise<string>;
}

export interface PasswordHasherPort {
  hash(password: string): Promise<string>;
  verify(password: string, encodedHash: string): Promise<boolean>;
  needsRehash(encodedHash: string): boolean;
}

export interface SessionTokenGeneratorPort {
  generate(): string;
}

export interface TokenDigestPort {
  digest(plaintextToken: string): Promise<string>;
}

export interface MediaInspectorPort {
  inspect(bytes: Uint8Array): Promise<{
    readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    readonly width: number;
    readonly height: number;
  }>;
}

export interface GenerationQueueMessage {
  readonly schemaVersion: 1;
  readonly jobId: string;
  readonly ownerUserId: string;
  readonly correlationId: string;
}

export interface GenerationQueuePort {
  enqueue(message: GenerationQueueMessage): Promise<void>;
}

export interface SmileSimulationProviderInput {
  readonly sourceBytes: Uint8Array;
  readonly sourceMimeType: string;
  readonly sourceSha256: string;
  readonly sourceMediaId: string;
  readonly generationContractVersion: string;
  readonly correlationId: string;
}

export interface SmileSimulationProviderOutput {
  readonly bytes: Uint8Array;
  readonly mimeType: 'image/png';
  readonly width: number;
  readonly height: number;
  readonly providerVersion: string;
  readonly parameters: ProvenanceParameters;
}

export interface SmileSimulationProviderPort {
  readonly key: string;
  generate(input: SmileSimulationProviderInput): Promise<SmileSimulationProviderOutput>;
}

export interface IdGeneratorPort {
  next(): string;
}

export interface ClockPort {
  now(): Date;
}

export interface ServiceDependencies {
  readonly unitOfWork: UnitOfWorkPort;
  readonly storage: ObjectStoragePort;
  readonly digest: DigestPort;
  readonly mediaInspector: MediaInspectorPort;
  readonly queue: GenerationQueuePort;
  readonly provider: SmileSimulationProviderPort;
  readonly ids: IdGeneratorPort;
  readonly clock: ClockPort;
}

export type Actor = ActorContext;


export type AccountActionEmailPurpose = 'verify_email' | 'reset_password';

export interface EmailDeliveryPort {
  sendAccountAction(input: {
    readonly to: string;
    readonly displayName: string;
    readonly purpose: AccountActionEmailPurpose;
    readonly actionUrl: string;
  }): Promise<void>;
}

export interface AuthRateLimiterPort {
  consume(input: {
    readonly scope: string;
    readonly keyHash: string;
    readonly now: Date;
    readonly windowSeconds: number;
    readonly limit: number;
  }): Promise<{ readonly allowed: boolean; readonly retryAfterSeconds: number; readonly count: number }>;
}

export interface RateLimitKeyDeriverPort {
  derive(logicalPreimage: string): string;
}

/**
 * Video rendering boundary (Phase 5 Stage 1) — separates composition semantics, owned
 * by evaluateVideoCompositionAtTime (video-composition-engine.ts), from rendering
 * implementation, owned by platform-specific adapters. Neither port has an
 * implementation in this stage: no Skia, FFmpeg, AVFoundation, MediaCodec, or backend
 * renderer is bound at this layer, and none is wired into ServiceDependencies. See
 * docs/phase-5-stage-1-video-rendering-boundary.md for the full responsibility split.
 */
export interface VideoFramePresenterPort {
  /**
   * Draws exactly one already-evaluated frame to whatever surface the adapter owns. Must
   * not perform its own time-stepping, animation scheduling, or composition logic — the
   * caller re-evaluates evaluateVideoCompositionAtTime for every frame and hands this
   * port a complete, immutable plan.
   */
  presentFrame(plan: VideoRenderPlanAtTime): void;
}

export interface VideoExportRendererPort {
  /**
   * Encodes a full export by sampling evaluateVideoCompositionAtTime at whatever frame
   * rate the adapter's own render profile implies (see VideoRenderProfileKey in
   * @dentpilot/contracts — FPS is a render/export policy, never stored in the document)
   * and writing an encoded artifact. No encoder technology is named or assumed here.
   */
  exportComposition(input: {
    readonly document: VideoCompositionDocument;
    readonly template: VideoTemplateDefinition;
    readonly assets: readonly CreationRenderAsset[];
    readonly target: RenderTarget;
  }): Promise<{ readonly outputUri: string; readonly durationMs: number }>;
}

export type VideoExportStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type VideoExportJobData = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly projectId: string;
  readonly revisionId: string;
  readonly templateId: string;
  readonly templateVersion: number;
  readonly requestFingerprint: string;
  readonly rendererContractVersion: number;
  readonly status: VideoExportStatus;
  readonly createdAt: Date;
};

export type VideoExportVersionData = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly exportJobId: string;
  readonly versionNumber: number;
  readonly mediaAssetId: string | null;
  readonly createdAt: Date;
};

export interface VideoExportRepositoryPort {
  insertJobAndVersion(job: VideoExportJobData, version: VideoExportVersionData): Promise<void>;
  findJobByFingerprint(fingerprint: string): Promise<VideoExportJobData | null>;
  findById(jobId: string): Promise<VideoExportJobData | null>;
  findLatestVersion(jobId: string): Promise<VideoExportVersionData | null>;
  updateJobStatus(jobId: string, status: VideoExportStatus): Promise<void>;
  attachMediaToVersion(versionId: string, mediaAssetId: string): Promise<void>;
  updateVersionStatus(versionId: string, status: VideoExportStatus): Promise<void>;
}

export interface VideoExportQueuePort {
  dispatchExport(jobId: string): Promise<void>;
  consumeExports(handler: (jobId: string) => Promise<void>): void;
}
