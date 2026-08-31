import { describe, expect, it } from 'vitest';

import {
  createCreationRequestSchema,
  updateCreationDraftRequestSchema,
  videoCreationDetailsSchema,
  videoCreationDraftSchema,
  videoCreationRevisionSchema,
  type CreationDocumentV1,
  type VideoCompositionDocumentV1,
} from '../index.js';

/**
 * Phase 5 Stage 2 API boundary contracts: the discriminated create-request union that
 * routes image vs video creation, the updateDraft union that must accept either document
 * shape while never losing which one it received, and the video-specific response DTOs.
 * These are the ONLY schemas that decide document routing at the wire boundary — see the
 * document routing invariant note on createCreationRequestSchema in index.ts.
 */

const beforeMediaId = '11111111-1111-4111-8111-111111111111';
const afterMediaId = '22222222-2222-4222-8222-222222222222';
const sourceMediaId = '33333333-3333-4333-8333-333333333333';
const projectId = '44444444-4444-4444-8444-444444444444';
const caseId = '55555555-5555-4555-8555-555555555555';

const imageDocument: CreationDocumentV1 = {
  schemaVersion: 1,
  templateRef: null,
  canvas: { aspectRatioKey: 'portrait_4_5' },
  slotState: { before: { panX: 0, panY: 0, scale: 1, rotation: 0 } },
  editableTextState: { beforeLabel: 'Before', afterLabel: 'After' },
  styleState: { theme: 'clinical-neutral' },
};

const videoDocument: VideoCompositionDocumentV1 = {
  schemaVersion: 1,
  templateRef: { templateId: 'classic-reveal', templateVersion: 1 },
  canvas: { aspectRatioKey: 'portrait_4_5' },
  durationMs: 4_500,
  assetBindings: {
    before: { mediaId: beforeMediaId },
    after: { mediaId: afterMediaId },
  },
  editableTextState: { beforeLabel: 'Before', afterLabel: 'After' },
  styleState: { theme: 'clinical-neutral' },
  renderProfile: { profileKey: 'preview' },
  audioRef: null,
};

describe('createCreationRequestSchema (document routing invariant, API boundary)', () => {
  it('accepts a well-formed before_after_image request', () => {
    expect(createCreationRequestSchema.parse({ type: 'before_after_image', sourceMediaId })).toEqual({
      type: 'before_after_image',
      sourceMediaId,
    });
  });

  it('accepts a well-formed before_after_video request', () => {
    expect(createCreationRequestSchema.parse({ type: 'before_after_video', beforeMediaId, afterMediaId })).toEqual({
      type: 'before_after_video',
      beforeMediaId,
      afterMediaId,
    });
  });

  it('rejects a request with no recognized type discriminant', () => {
    expect(() => createCreationRequestSchema.parse({ sourceMediaId })).toThrow();
    expect(() => createCreationRequestSchema.parse({ type: 'smile_simulation', sourceMediaId })).toThrow();
    expect(() => createCreationRequestSchema.parse({ type: 'unknown_creation_type' })).toThrow();
  });

  it('never lets one variant\'s shape satisfy the other — schemaVersion is not a routing signal here', () => {
    // An image-shaped payload mislabeled as video, and vice versa, must both fail: the
    // union discriminates on `type` alone, never on which fields happen to be present.
    expect(() => createCreationRequestSchema.parse({ type: 'before_after_video', sourceMediaId })).toThrow();
    expect(() => createCreationRequestSchema.parse({ type: 'before_after_image', beforeMediaId, afterMediaId })).toThrow();
  });

  it('rejects unknown fields on either variant (strict)', () => {
    expect(() => createCreationRequestSchema.parse({ type: 'before_after_image', sourceMediaId, extra: true })).toThrow();
    expect(() => createCreationRequestSchema.parse({ type: 'before_after_video', beforeMediaId, afterMediaId, extra: true })).toThrow();
  });

  it('rejects a video request missing either media reference', () => {
    expect(() => createCreationRequestSchema.parse({ type: 'before_after_video', beforeMediaId })).toThrow();
    expect(() => createCreationRequestSchema.parse({ type: 'before_after_video', afterMediaId })).toThrow();
  });

  it('rejects malformed media ids on either variant', () => {
    expect(() => createCreationRequestSchema.parse({ type: 'before_after_image', sourceMediaId: 'not-a-uuid' })).toThrow();
    expect(() => createCreationRequestSchema.parse({ type: 'before_after_video', beforeMediaId: 'not-a-uuid', afterMediaId })).toThrow();
  });
});

describe('updateCreationDraftRequestSchema (union of both document shapes)', () => {
  it('accepts an image document without losing its shape', () => {
    const parsed = updateCreationDraftRequestSchema.parse({ expectedRevision: 1, document: imageDocument });
    expect(parsed.document).toEqual(imageDocument);
  });

  it('accepts a video document without losing its shape', () => {
    const parsed = updateCreationDraftRequestSchema.parse({ expectedRevision: 1, document: videoDocument });
    expect(parsed.document).toEqual(videoDocument);
  });

  it('rejects a document matching neither the image nor the video schema', () => {
    expect(() => updateCreationDraftRequestSchema.parse({ expectedRevision: 1, document: { schemaVersion: 1, nonsense: true } })).toThrow();
  });

  it('rejects a non-positive expectedRevision', () => {
    expect(() => updateCreationDraftRequestSchema.parse({ expectedRevision: 0, document: imageDocument })).toThrow();
  });
});

describe('video creation response DTOs', () => {
  const now = '2026-08-29T12:00:00.000Z';

  it('round-trips a video creation draft', () => {
    const draft = {
      projectId,
      caseId,
      schemaVersion: 1 as const,
      document: videoDocument,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    expect(videoCreationDraftSchema.parse(draft)).toEqual(draft);
  });

  it('round-trips a video creation revision with its bindings', () => {
    const revision = {
      id: '66666666-6666-4666-8666-666666666666',
      projectId,
      caseId,
      revisionNumber: 1,
      documentSchemaVersion: 1 as const,
      document: videoDocument,
      documentSha256: 'a'.repeat(64),
      bindings: [
        { bindingKey: 'before' as const, mediaId: beforeMediaId },
        { bindingKey: 'after' as const, mediaId: afterMediaId },
      ],
      createdAt: now,
    };
    expect(videoCreationRevisionSchema.parse(revision)).toEqual(revision);
  });

  it('rejects a video draft whose document does not satisfy VideoCompositionDocumentV1', () => {
    expect(() => videoCreationDraftSchema.parse({
      projectId,
      caseId,
      schemaVersion: 1,
      document: imageDocument,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    })).toThrow();
  });

  it('round-trips full video creation details (project + bindings + draft)', () => {
    const details = {
      project: {
        id: projectId,
        caseId,
        type: 'before_after_video' as const,
        sourceMediaId: beforeMediaId,
        createdAt: now,
      },
      bindings: [
        { bindingKey: 'before' as const, mediaId: beforeMediaId },
        { bindingKey: 'after' as const, mediaId: afterMediaId },
      ],
      draft: {
        projectId,
        caseId,
        schemaVersion: 1 as const,
        document: videoDocument,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      },
    };
    expect(videoCreationDetailsSchema.parse(details)).toEqual(details);
  });
});
