import type {
  AuditEventRecord,
  CaseRecord,
  CreationAssetBindingRecord,
  CreationDraftRecord,
  CreationProjectRecord,
  CreationRevisionAssetRecord,
  CreationRevisionRecord,
  GenerationJobRecord,
  GenerationVersionRecord,
  MediaAssetRecord,
  MediaUploadSessionRecord,
} from '@dentpilot/application';
import type {
  AuditEventDto,
  CaseDto,
  CreationBindingDto,
  CreationDocument,
  CreationDraftDto,
  CreationRevisionDto,
  GenerationJobDto,
  GenerationVersionDto,
  MediaAssetDto,
  MediaUploadSessionDto,
  ProjectDto,
  VideoCompositionDocument,
  VideoCreationDraftDto,
  VideoCreationRevisionDto,
} from '@dentpilot/contracts';

const asIso = (date: Date): string => date.toISOString();

export function presentCase(value: CaseRecord): CaseDto {
  return {
    id: value.id,
    displayLabel: value.displayLabel,
    referenceCode: value.referenceCode,
    status: value.status,
    createdAt: asIso(value.createdAt),
    updatedAt: asIso(value.updatedAt),
  };
}

export function presentMediaUploadSession(value: MediaUploadSessionRecord): MediaUploadSessionDto {
  return {
    uploadId: value.id,
    status: value.status,
    expiresAt: asIso(value.expiresAt),
    mediaId: value.status === 'committed' ? value.committedMediaId : null,
  };
}

export function presentMedia(value: MediaAssetRecord): MediaAssetDto {
  return {
    id: value.id,
    caseId: value.caseId,
    kind: value.kind,
    purpose: value.purpose,
    mimeType: value.mimeType as MediaAssetDto['mimeType'],
    byteSize: value.byteSize,
    width: value.width,
    height: value.height,
    sha256: value.sha256,
    sourceMediaId: value.sourceMediaId,
    createdAt: asIso(value.createdAt),
    contentUrl: `/api/v1/media/${value.id}/content`,
  };
}

export function presentProject(value: CreationProjectRecord): ProjectDto {
  return {
    id: value.id,
    caseId: value.caseId,
    type: value.type,
    sourceMediaId: value.sourceMediaId,
    createdAt: asIso(value.createdAt),
  };
}

export function presentCreationBinding(value: CreationAssetBindingRecord | CreationRevisionAssetRecord): CreationBindingDto {
  return { bindingKey: value.bindingKey, mediaId: value.mediaId };
}

// CreationDraftRecord.document / CreationRevisionRecord.document are typed
// `CreationDocument | VideoCompositionDocument` (Phase 5 Stage 2, ports.ts) because the
// same relational rows now back both project types. Every caller of these two
// image-specific presenters (CreationsController) resolves project.type first and only
// reaches them for `before_after_image` projects — CreationService's document routing
// invariant guarantees an image project's persisted document is always CreationDocument —
// so this narrowing cast reflects an already-established fact, it does not decide routing.
export function presentCreationDraft(value: CreationDraftRecord): CreationDraftDto {
  return {
    projectId: value.projectId,
    caseId: value.caseId,
    schemaVersion: value.schemaVersion,
    document: value.document as CreationDocument,
    revision: value.revision,
    createdAt: asIso(value.createdAt),
    updatedAt: asIso(value.updatedAt),
  };
}

export function presentCreationRevision(value: CreationRevisionRecord, bindings: readonly CreationRevisionAssetRecord[]): CreationRevisionDto {
  return {
    id: value.id,
    projectId: value.projectId,
    caseId: value.caseId,
    revisionNumber: value.revisionNumber,
    documentSchemaVersion: value.documentSchemaVersion,
    document: value.document as CreationDocument,
    documentSha256: value.documentSha256,
    bindings: bindings.map(presentCreationBinding),
    createdAt: asIso(value.createdAt),
  };
}

/**
 * Video counterparts of presentCreationDraft/presentCreationRevision (Phase 5 Stage 2).
 * The document routing invariant is enforced by CreationService before either of these is
 * ever called — a project.type === 'before_after_video' record's document is always a
 * validated VideoCompositionDocumentV1, so the cast here only narrows a type the caller
 * already guaranteed, it never re-decides routing.
 */
export function presentVideoCreationDraft(value: CreationDraftRecord): VideoCreationDraftDto {
  return {
    projectId: value.projectId,
    caseId: value.caseId,
    schemaVersion: value.schemaVersion,
    document: value.document as VideoCompositionDocument,
    revision: value.revision,
    createdAt: asIso(value.createdAt),
    updatedAt: asIso(value.updatedAt),
  };
}

export function presentVideoCreationRevision(value: CreationRevisionRecord, bindings: readonly CreationRevisionAssetRecord[]): VideoCreationRevisionDto {
  return {
    id: value.id,
    projectId: value.projectId,
    caseId: value.caseId,
    revisionNumber: value.revisionNumber,
    documentSchemaVersion: value.documentSchemaVersion,
    document: value.document as VideoCompositionDocument,
    documentSha256: value.documentSha256,
    bindings: bindings.map(presentCreationBinding),
    createdAt: asIso(value.createdAt),
  };
}

export function presentGenerationJob(value: GenerationJobRecord): GenerationJobDto {
  return {
    id: value.id,
    caseId: value.caseId,
    projectId: value.projectId,
    sourceMediaId: value.sourceMediaId,
    providerKey: value.providerKey,
    status: value.status,
    createdAt: asIso(value.createdAt),
    startedAt: value.startedAt === null ? null : asIso(value.startedAt),
    finishedAt: value.finishedAt === null ? null : asIso(value.finishedAt),
    errorCode: value.errorCode,
  };
}

export function presentGenerationVersion(value: GenerationVersionRecord): GenerationVersionDto {
  return {
    id: value.id,
    generationJobId: value.generationJobId,
    mediaAssetId: value.mediaAssetId,
    versionNumber: value.versionNumber,
    providerKey: value.providerKey,
    providerVersion: value.providerVersion,
    createdAt: asIso(value.createdAt),
    resultMediaUrl: `/api/v1/media/${value.mediaAssetId}/content`,
  };
}

export function presentAuditEvent(value: AuditEventRecord): AuditEventDto {
  return {
    id: value.id,
    eventType: value.eventType,
    caseId: value.caseId,
    projectId: value.projectId,
    generationJobId: value.generationJobId,
    occurredAt: asIso(value.occurredAt),
    metadata: value.metadata,
  };
}
