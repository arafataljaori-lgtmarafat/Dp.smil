import { z } from 'zod';

import { templateAspectRatioKeys, templateStyleTokens, editableTemplateTextKeys } from './templates.js';

/** Declared locally (not imported from ./index.js) to avoid a circular module dependency: index.ts re-exports this file. */
const uuidSchema = z.string().uuid();

/**
 * VideoCompositionDocumentV1 — the versioned temporal composition contract for
 * Before/After video creations. Independent from CreationDocumentV1 (packages/contracts
 * src/index.ts): a separate schemaVersion namespace, routed at the application layer by
 * CreationProject.type ('before_after_video' vs 'before_after_image'), never merged into
 * or mutating the image document. See docs/phase-5-stage-1-case-to-video-architecture.md
 * for the routing model and docs/phase-5-stage-1-temporal-invariants.md for the full
 * timing/ownership/idempotency invariant list this contract and its evaluator uphold.
 *
 * Time base: integer milliseconds only. No floating-point wall-clock semantics anywhere
 * in this contract — every duration and offset is a bounded, finite, non-negative
 * integer. FPS is deliberately absent from this document: it is a render/export policy
 * (see renderProfileKey) so the same composition can drive both preview and final
 * render at whatever sampling rate each is capable of.
 */

export const videoBindingKeySchema = z.enum(['before', 'after']);

export const MIN_VIDEO_DURATION_MS = 1_000;
export const MAX_VIDEO_DURATION_MS = 60_000;

const restrictedVideoTextSchema = z.string().trim().max(80).refine(
  (value) => !/[<>]/.test(value),
  'Text must not contain markup delimiters.',
);

export const videoRenderProfileKeys = ['preview', 'export_1080p_30fps', 'export_720p_30fps'] as const;
export type VideoRenderProfileKey = (typeof videoRenderProfileKeys)[number];

export const videoAudioReferenceSchema = z.object({
  mediaId: uuidSchema,
  /** Offset, in whole milliseconds, into the referenced audio asset where playback would begin. Playback is not implemented in this stage. */
  startMs: z.number().int().min(0),
  volume: z.number().finite().min(0).max(1),
}).strict();
export type VideoAudioReference = z.infer<typeof videoAudioReferenceSchema>;

export const videoCompositionDocumentV1Schema = z.object({
  schemaVersion: z.literal(1),
  templateRef: z.object({
    templateId: z.string().trim().min(1).max(80),
    templateVersion: z.number().int().positive(),
  }).strict(),
  canvas: z.object({
    aspectRatioKey: z.enum(templateAspectRatioKeys),
  }).strict(),
  /**
   * Must equal the resolved template's total duration (sum of its segment
   * defaultDurationMs) for this foundational stage — verified in
   * resolveVideoTemplateForDocument, not at parse time, mirroring how
   * CreationDocumentV1's template/aspect-ratio cross-checks work. Stored explicitly (not
   * merely derived) so a future per-document duration override does not require a
   * breaking schema change.
   */
  durationMs: z.number().int().min(MIN_VIDEO_DURATION_MS).max(MAX_VIDEO_DURATION_MS),
  assetBindings: z.object({
    before: z.object({ mediaId: uuidSchema }).strict().optional(),
    after: z.object({ mediaId: uuidSchema }).strict().optional(),
  }).strict(),
  editableTextState: z.object({
    beforeLabel: restrictedVideoTextSchema.optional(),
    afterLabel: restrictedVideoTextSchema.optional(),
    title: restrictedVideoTextSchema.optional(),
    subtitle: restrictedVideoTextSchema.optional(),
  }).strict(),
  styleState: z.object({
    theme: z.enum(templateStyleTokens),
  }).strict(),
  renderProfile: z.object({
    profileKey: z.enum(videoRenderProfileKeys),
  }).strict(),
  audioRef: videoAudioReferenceSchema.nullable(),
}).strict();
export type VideoCompositionDocumentV1 = z.infer<typeof videoCompositionDocumentV1Schema>;
export type VideoCompositionDocument = VideoCompositionDocumentV1;

export const DEFAULT_MAX_VIDEO_COMPOSITION_DOCUMENT_BYTES = 16_384;

/** Stable JSON for contract-safe document values; key insertion order never affects the output. Mirrors canonicalizeCreationDocument. */
export function canonicalizeVideoCompositionDocument(document: VideoCompositionDocument): string {
  const canonicalize = (value: unknown): string => {
    if (value === null) return 'null';
    if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError('Video composition document numbers must be finite.');
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
    if (typeof value === 'object') {
      const record = value as Readonly<Record<string, unknown>>;
      return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
    }
    throw new TypeError('Video composition document contains a non-JSON value.');
  };
  return canonicalize(videoCompositionDocumentV1Schema.parse(document));
}

export function assertVideoCompositionDocumentSize(document: VideoCompositionDocument, maximumBytes: number): void {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) throw new RangeError('Video composition document size limit must be a positive integer.');
  const byteLength = new TextEncoder().encode(canonicalizeVideoCompositionDocument(document)).byteLength;
  if (byteLength > maximumBytes) throw new Error('Video composition document exceeds the configured size limit.');
}

export type VideoBindingKey = z.infer<typeof videoBindingKeySchema>;
export { editableTemplateTextKeys as videoEditableTextKeys };
