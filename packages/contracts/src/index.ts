import { z } from 'zod';

import { videoCompositionDocumentV1Schema } from './video-composition.js';

export const uuidSchema = z.string().uuid();
export const isoDateSchema = z.string().datetime({ offset: true });

export const caseIdParamsSchema = z.object({ caseId: uuidSchema }).strict();
export const mediaIdParamsSchema = z.object({ mediaId: uuidSchema }).strict();
export const projectIdParamsSchema = z.object({ projectId: uuidSchema }).strict();
export const generationJobIdParamsSchema = z.object({ generationJobId: uuidSchema }).strict();
export const mediaUploadIdParamsSchema = z.object({ uploadId: uuidSchema }).strict();

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(160)
  .regex(/^\S+$/, 'Idempotency-Key must not contain whitespace.')
  .refine(
    (value) => ![...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    }),
    'Idempotency-Key contains control characters.',
  );

export const createCaseRequestSchema = z.object({
  displayLabel: z.string().trim().min(2).max(80),
  referenceCode: z.string().trim().min(1).max(64).optional(),
});
export type CreateCaseRequest = z.infer<typeof createCaseRequestSchema>;

export const createProjectRequestSchema = z.object({
  sourceMediaId: uuidSchema,
});
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum([
      'VALIDATION_ERROR',
      'NOT_FOUND',
      'CONFLICT',
      'IDEMPOTENCY_CONFLICT',
      'CREATION_REVISION_CONFLICT',
      'CREATION_BINDING_REQUIRED',
      'SOURCE_INTEGRITY_MISMATCH',
      'FORBIDDEN',
      'INVALID_STATE_TRANSITION',
      'MEDIA_VALIDATION_ERROR',
      'STORAGE_ERROR',
      'GENERATION_ERROR',
      'INTERNAL_ERROR',
      'UNAUTHENTICATED',
      'INVALID_CREDENTIALS',
      'ACCOUNT_NOT_VERIFIED',
      'ACCOUNT_DISABLED',
      'SESSION_EXPIRED',
      'SESSION_REVOKED',
      'RATE_LIMITED',
      'INVALID_ACTION_TOKEN',
      'ACTION_TOKEN_EXPIRED',
      'EMAIL_DELIVERY_UNAVAILABLE',
      'AUTH_RATE_LIMIT_UNAVAILABLE',
      'UPLOAD_SESSION_EXPIRED',
      'UPLOAD_IN_PROGRESS',
      'MEDIA_EMPTY',
      'MEDIA_TOO_LARGE',
      'UNSUPPORTED_MEDIA_FORMAT',
      'MEDIA_DECODE_FAILED',
      'MEDIA_DIMENSIONS_INVALID',
      'MEDIA_PIXEL_LIMIT_EXCEEDED',
      'TEMP_STORAGE_FAILED',
      'STORAGE_WRITE_FAILED',
      'UPLOAD_PROCESSING_TIMEOUT',
      'PERSISTENCE_FAILED',
    ]),
    message: z.string(),
    requestId: z.string(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const caseSchema = z.object({
  id: uuidSchema,
  displayLabel: z.string(),
  referenceCode: z.string().nullable(),
  status: z.enum(['active', 'archived']),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type CaseDto = z.infer<typeof caseSchema>;

export const mediaUploadStatusSchema = z.enum(['created', 'processing', 'committed', 'failed', 'expired']);
export type MediaUploadStatus = z.infer<typeof mediaUploadStatusSchema>;

export const mediaUploadSessionSchema = z.object({
  uploadId: uuidSchema,
  status: mediaUploadStatusSchema,
  expiresAt: isoDateSchema,
  mediaId: uuidSchema.nullable(),
}).strict();
export type MediaUploadSessionDto = z.infer<typeof mediaUploadSessionSchema>;
export const createMediaUploadResponseSchema = mediaUploadSessionSchema;
export const mediaUploadStatusResponseSchema = mediaUploadSessionSchema;

export const mediaAssetSchema = z.object({
  id: uuidSchema,
  caseId: uuidSchema,
  kind: z.enum(['source', 'derived', 'generated']),
  purpose: z.enum(['source_photo', 'mock_simulation_result']),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  byteSize: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sha256: z.string().length(64),
  sourceMediaId: uuidSchema.nullable(),
  createdAt: isoDateSchema,
  contentUrl: z.string().startsWith('/api/v1/media/'),
});
export type MediaAssetDto = z.infer<typeof mediaAssetSchema>;

export const projectSchema = z.object({
  id: uuidSchema,
  caseId: uuidSchema,
  type: z.enum(['smile_simulation', 'before_after_image', 'before_after_video']),
  sourceMediaId: uuidSchema,
  createdAt: isoDateSchema,
});
export type ProjectDto = z.infer<typeof projectSchema>;

export const generationJobSchema = z.object({
  id: uuidSchema,
  caseId: uuidSchema,
  projectId: uuidSchema,
  sourceMediaId: uuidSchema,
  providerKey: z.string(),
  status: z.enum(['queued', 'processing', 'succeeded', 'failed', 'cancelled']),
  createdAt: isoDateSchema,
  startedAt: isoDateSchema.nullable(),
  finishedAt: isoDateSchema.nullable(),
  errorCode: z.string().nullable(),
});
export type GenerationJobDto = z.infer<typeof generationJobSchema>;

export const generationVersionSchema = z.object({
  id: uuidSchema,
  generationJobId: uuidSchema,
  mediaAssetId: uuidSchema,
  versionNumber: z.number().int().positive(),
  providerKey: z.string(),
  providerVersion: z.string(),
  createdAt: isoDateSchema,
  resultMediaUrl: z.string().startsWith('/api/v1/media/'),
});
export type GenerationVersionDto = z.infer<typeof generationVersionSchema>;

export const auditEventSchema = z.object({
  id: uuidSchema,
  eventType: z.string(),
  caseId: uuidSchema.nullable(),
  projectId: uuidSchema.nullable(),
  generationJobId: uuidSchema.nullable(),
  occurredAt: isoDateSchema,
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
});
export type AuditEventDto = z.infer<typeof auditEventSchema>;

export const workspaceSchema = z.object({
  patientCase: caseSchema,
  media: z.array(mediaAssetSchema),
  projects: z.array(projectSchema),
  generations: z.array(generationJobSchema),
  audits: z.array(auditEventSchema),
});
export type WorkspaceDto = z.infer<typeof workspaceSchema>;

export const generationStatusResponseSchema = z.object({
  job: generationJobSchema,
  version: generationVersionSchema.nullable(),
});
export type GenerationStatusResponse = z.infer<typeof generationStatusResponseSchema>;

export const authEmailSchema = z.string().trim().email().max(254);
export const authPasswordSchema = z.string().min(12).max(128);
export const displayNameSchema = z.string().trim().min(1).max(120);
export const opaqueTokenSchema = z.string().min(32).max(512).regex(/^[A-Za-z0-9_-]+$/);

export const registerRequestSchema = z.object({
  email: authEmailSchema,
  password: authPasswordSchema,
  displayName: displayNameSchema,
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({ email: authEmailSchema, password: z.string().min(1).max(128) });
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const emailRequestSchema = z.object({ email: authEmailSchema });
export const actionTokenRequestSchema = z.object({ token: opaqueTokenSchema });
export const resetPasswordRequestSchema = z.object({ resetToken: opaqueTokenSchema, newPassword: authPasswordSchema });
export const changePasswordRequestSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: authPasswordSchema });

export const accountSchema = z.object({
  id: uuidSchema,
  email: authEmailSchema,
  displayName: z.string(),
  emailVerified: z.boolean(),
  createdAt: isoDateSchema,
});
export type AccountDto = z.infer<typeof accountSchema>;

export const accountResponseSchema = z.object({ data: accountSchema });
export const loginResponseSchema = z.object({
  data: z.object({ token: opaqueTokenSchema, sessionId: uuidSchema, expiresAt: isoDateSchema }),
});
export const registrationResponseSchema = z.object({
  data: z.object({ id: uuidSchema, email: authEmailSchema, status: z.literal('pending_verification') }),
});

export const authSessionSchema = z.object({
  sessionId: uuidSchema,
  createdAt: isoDateSchema,
  lastSeenAt: isoDateSchema,
  expiresAt: isoDateSchema,
  currentSession: z.boolean(),
});
export type AuthSessionDto = z.infer<typeof authSessionSchema>;
export const sessionListResponseSchema = z.object({ data: z.array(authSessionSchema) });


export const creationBindingKeys = ['before', 'after'] as const;
export type CreationBindingKey = (typeof creationBindingKeys)[number];

const restrictedTextSchema = z.string().trim().max(80).refine(
  (value) => !/[<>]/.test(value),
  'Text must not contain markup delimiters.',
);
const normalizedTransformSchema = z.object({
  panX: z.number().finite().min(-1).max(1),
  panY: z.number().finite().min(-1).max(1),
  scale: z.number().finite().min(0.25).max(3),
  rotation: z.number().finite().min(-180).max(180),
}).strict();

export const creationDocumentV1Schema = z.object({
  schemaVersion: z.literal(1),
  templateRef: z.object({
    templateId: z.string().trim().min(1).max(80),
    templateVersion: z.number().int().positive(),
  }).strict().nullable(),
  canvas: z.object({
    aspectRatioKey: z.enum(['square', 'portrait_4_5', 'story_9_16', 'landscape_16_9']),
  }).strict(),
  slotState: z.object({
    before: normalizedTransformSchema.optional(),
    after: normalizedTransformSchema.optional(),
  }).strict(),
  editableTextState: z.object({
    beforeLabel: restrictedTextSchema,
    afterLabel: restrictedTextSchema,
    title: restrictedTextSchema.optional(),
    subtitle: restrictedTextSchema.optional(),
  }).strict(),
  styleState: z.object({
    theme: z.enum(['clinical-neutral', 'clinical-blue', 'clinical-warm']),
  }).strict(),
}).strict();
export type CreationDocumentV1 = z.infer<typeof creationDocumentV1Schema>;

export const creationDocumentSchema = creationDocumentV1Schema;
export type CreationDocument = CreationDocumentV1;

export const DEFAULT_MAX_CREATION_DOCUMENT_BYTES = 16_384;

/** Produces stable JSON for contract-safe document values; key insertion order never affects the output. */
export function canonicalizeCreationDocument(document: CreationDocument): string {
  const canonicalize = (value: unknown): string => {
    if (value === null) return 'null';
    if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError('Creation document numbers must be finite.');
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
    if (typeof value === 'object') {
      const record = value as Readonly<Record<string, unknown>>;
      return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
    }
    throw new TypeError('Creation document contains a non-JSON value.');
  };
  return canonicalize(creationDocumentSchema.parse(document));
}

export function assertCreationDocumentSize(document: CreationDocument, maximumBytes: number): void {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) throw new RangeError('Creation document size limit must be a positive integer.');
  const byteLength = new TextEncoder().encode(canonicalizeCreationDocument(document)).byteLength;
  if (byteLength > maximumBytes) throw new Error('Creation document exceeds the configured size limit.');
}

export const createBeforeAfterImageRequestSchema = z.object({
  type: z.literal('before_after_image'),
  sourceMediaId: uuidSchema,
}).strict();
export type CreateBeforeAfterImageRequest = z.infer<typeof createBeforeAfterImageRequestSchema>;

/**
 * Both Before and After media must be supplied up front: unlike a fresh image creation
 * (which starts bound only to its source media), a video creation is only meaningful once
 * both segments it composes have media, so both bindings are established transactionally
 * at creation (see CreationService.createBeforeAfterVideo). A client-supplied
 * Idempotency-Key header is required for this request (see idempotencyKeySchema) —
 * legacy image creation intentionally keeps its existing non-idempotent contract.
 */
export const createBeforeAfterVideoRequestSchema = z.object({
  type: z.literal('before_after_video'),
  beforeMediaId: uuidSchema,
  afterMediaId: uuidSchema,
}).strict();
export type CreateBeforeAfterVideoRequest = z.infer<typeof createBeforeAfterVideoRequestSchema>;

/**
 * Document routing invariant (Phase 5 Stage 2): this discriminated union is the ONLY
 * place the wire format branches on `type`. Everywhere downstream, the parser used to
 * validate/persist a creation's document is selected from the persisted
 * CreationProject.type, never from this request payload's shape and never from
 * schemaVersion (both document schemas currently share schemaVersion: 1).
 */
export const createCreationRequestSchema = z.discriminatedUnion('type', [
  createBeforeAfterImageRequestSchema,
  createBeforeAfterVideoRequestSchema,
]);
export type CreateCreationRequest = z.infer<typeof createCreationRequestSchema>;

export const replaceCreationBindingsRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  bindings: z.array(z.object({
    bindingKey: z.enum(creationBindingKeys),
    mediaId: uuidSchema,
  }).strict()).min(1).max(2).superRefine((bindings, context) => {
    const seen = new Set<string>();
    bindings.forEach((binding, index) => {
      if (seen.has(binding.bindingKey)) context.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'bindingKey'], message: 'Binding keys must be unique.' });
      seen.add(binding.bindingKey);
    });
  }),
}).strict();
export type ReplaceCreationBindingsRequest = z.infer<typeof replaceCreationBindingsRequestSchema>;

/**
 * The two document schemas are `.strict()` with disjoint, non-overlapping key sets (a
 * video document can never satisfy the image schema and vice versa), so this union
 * parses deterministically — it is a wire-format acceptance boundary only. It is never
 * used as the routing decision itself: the application service independently resolves
 * the correct schema from the persisted CreationProject.type and re-validates against
 * that, so a video document submitted for an image project (or vice versa) is rejected
 * downstream regardless of which union arm happened to parse it here.
 */
export const updateCreationDraftRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  document: z.union([creationDocumentSchema, videoCompositionDocumentV1Schema]),
}).strict();
export type UpdateCreationDraftRequest = z.infer<typeof updateCreationDraftRequestSchema>;

export const createCreationRevisionRequestSchema = z.object({
  expectedDraftRevision: z.number().int().positive(),
}).strict();
export type CreateCreationRevisionRequest = z.infer<typeof createCreationRevisionRequestSchema>;

export const creationBindingSchema = z.object({
  bindingKey: z.enum(creationBindingKeys),
  mediaId: uuidSchema,
}).strict();
export type CreationBindingDto = z.infer<typeof creationBindingSchema>;

export const creationDraftSchema = z.object({
  projectId: uuidSchema,
  caseId: uuidSchema,
  schemaVersion: z.literal(1),
  document: creationDocumentSchema,
  revision: z.number().int().positive(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
}).strict();
export type CreationDraftDto = z.infer<typeof creationDraftSchema>;

export const creationBindingMutationSchema = z.object({
  bindings: z.array(creationBindingSchema),
  draft: creationDraftSchema,
}).strict();
export type CreationBindingMutationDto = z.infer<typeof creationBindingMutationSchema>;

export const creationRevisionSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  caseId: uuidSchema,
  revisionNumber: z.number().int().positive(),
  documentSchemaVersion: z.literal(1),
  document: creationDocumentSchema,
  documentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  bindings: z.array(creationBindingSchema),
  createdAt: isoDateSchema,
}).strict();
export type CreationRevisionDto = z.infer<typeof creationRevisionSchema>;

export const creationDetailsSchema = z.object({
  project: projectSchema,
  bindings: z.array(creationBindingSchema),
  draft: creationDraftSchema,
}).strict();
export type CreationDetailsDto = z.infer<typeof creationDetailsSchema>;

export const creationListItemSchema = projectSchema;
export type CreationListItemDto = z.infer<typeof creationListItemSchema>;

/**
 * Video-specific response contracts, kept separate from the image-only
 * creationDraftSchema/creationRevisionSchema/creationDetailsSchema above rather than
 * broadened into a union: legacy image clients (mobile) parse those schemas as-is, and a
 * response's project.type (already returned alongside every draft/revision/details
 * payload) is what a caller uses to pick which of these to parse — never document shape.
 */
export const videoCreationDraftSchema = z.object({
  projectId: uuidSchema,
  caseId: uuidSchema,
  schemaVersion: z.literal(1),
  document: videoCompositionDocumentV1Schema,
  revision: z.number().int().positive(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
}).strict();
export type VideoCreationDraftDto = z.infer<typeof videoCreationDraftSchema>;

export const videoCreationRevisionSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  caseId: uuidSchema,
  revisionNumber: z.number().int().positive(),
  documentSchemaVersion: z.literal(1),
  document: videoCompositionDocumentV1Schema,
  documentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  bindings: z.array(creationBindingSchema),
  createdAt: isoDateSchema,
}).strict();
export type VideoCreationRevisionDto = z.infer<typeof videoCreationRevisionSchema>;

export const videoCreationDetailsSchema = z.object({
  project: projectSchema,
  bindings: z.array(creationBindingSchema),
  draft: videoCreationDraftSchema,
}).strict();
export type VideoCreationDetailsDto = z.infer<typeof videoCreationDetailsSchema>;

export const creationRevisionIdParamsSchema = z.object({
  creationId: uuidSchema,
  revisionId: uuidSchema,
}).strict();
export const creationIdParamsSchema = z.object({ creationId: uuidSchema }).strict();

export * from './templates.js';
export * from './video-templates.js';
export * from './video-composition.js';
