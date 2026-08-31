import { z } from 'zod';

import { templateAspectRatioKeys, templateStyleTokens, editableTemplateTextKeys, normalizedRectSchema } from './templates.js';
import { MIN_VIDEO_DURATION_MS, MAX_VIDEO_DURATION_MS } from './video-composition.js';

/**
 * Video template contract — extends the existing declarative template architecture
 * (see templates.ts) with time-based semantics. A video template is data, never code:
 * it declares bindings, timeline structure, motion/transition primitives, and overlay
 * slots; it never embeds executable logic. Reuses the same aspect-ratio, style-token,
 * editable-text-key, and normalized-rect vocabulary as the image template contract so
 * the two systems stay conceptually aligned without being merged.
 */

const templateBindingKeySchema = z.enum(['before', 'after']);

export const motionPrimitiveTypes = ['static', 'panZoom'] as const;
export type MotionPrimitiveType = (typeof motionPrimitiveTypes)[number];

export const transitionPrimitiveTypes = ['crossfade', 'reveal', 'splitReveal'] as const;
export type TransitionPrimitiveType = (typeof transitionPrimitiveTypes)[number];

export const easingKeys = ['linear', 'easeInOutCubic'] as const;
export type EasingKey = (typeof easingKeys)[number];

/** A motion primitive is declared once per template segment; both endpoints are template-authored defaults. */
const motionTransformSchema = z.object({
  panX: z.number().finite().min(-1).max(1),
  panY: z.number().finite().min(-1).max(1),
  scale: z.number().finite().min(1).max(3),
}).strict();

const staticMotionSchema = z.object({
  type: z.literal('static'),
  transform: motionTransformSchema,
}).strict();
const panZoomMotionSchema = z.object({
  type: z.literal('panZoom'),
  from: motionTransformSchema,
  to: motionTransformSchema,
  easing: z.enum(easingKeys),
}).strict();
export const motionPrimitiveSchema = z.discriminatedUnion('type', [staticMotionSchema, panZoomMotionSchema]);
export type MotionPrimitive = z.infer<typeof motionPrimitiveSchema>;

/** Minimum whole-millisecond duration for any single segment; keeps motion primitives meaningful and non-degenerate. */
export const MIN_SEGMENT_DURATION_MS = 300;
export const MAX_SEGMENT_DURATION_MS = 20_000;
export const MAX_TEMPLATE_SEGMENTS = 8;
export const MAX_TEMPLATE_OVERLAYS = 8;

export const videoTemplateSegmentSchema = z.object({
  id: z.string().trim().min(1).max(80),
  bindingKey: templateBindingKeySchema,
  /** Duration this segment occupies when the template's default duration policy is used. */
  defaultDurationMs: z.number().int().min(MIN_SEGMENT_DURATION_MS).max(MAX_SEGMENT_DURATION_MS),
  slotRect: normalizedRectSchema,
  fit: z.enum(['cover', 'contain']),
  cornerRadius: z.number().finite().min(0).max(0.1),
  motion: motionPrimitiveSchema,
}).strict();
export type VideoTemplateSegment = z.infer<typeof videoTemplateSegmentSchema>;

/** A transition is declared as attached to the segment it follows; it borrows only that segment's own tail. */
export const videoTemplateTransitionSchema = z.object({
  afterSegmentId: z.string().trim().min(1).max(80),
  type: z.enum(transitionPrimitiveTypes),
  durationMs: z.number().int().min(100).max(2_000),
}).strict();
export type VideoTemplateTransition = z.infer<typeof videoTemplateTransitionSchema>;

const videoOverlayBaseSchema = {
  id: z.string().trim().min(1).max(80),
  zIndex: z.number().int().min(0).max(100),
  /** Both bounds are relative to the full document duration and half-open: [visibleFromMs, visibleToMs). */
  visibleFromMs: z.number().int().min(0),
  visibleToMs: z.number().int().positive(),
};
const videoTextOverlaySchema = z.object({
  ...videoOverlayBaseSchema,
  type: z.literal('text'),
  textKey: z.enum(editableTemplateTextKeys),
  rect: normalizedRectSchema,
  colorToken: z.enum(['canvas', 'surface', 'ink', 'muted', 'accent', 'accentSoft', 'white']),
  fontScale: z.number().finite().min(0.02).max(0.18),
  align: z.enum(['left', 'center', 'right']),
}).strict().superRefine((value, context) => {
  if (value.visibleToMs <= value.visibleFromMs) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'visibleToMs must be greater than visibleFromMs.' });
  }
});
export type VideoTextOverlay = z.infer<typeof videoTextOverlaySchema>;

export const videoTemplateAudioCapabilitySchema = z.object({
  /** Declares whether this template accepts an optional audio reference; playback is not implemented in this stage. */
  acceptsAudioReference: z.boolean(),
}).strict();

export const videoTemplateDefinitionSchema = z.object({
  id: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/),
  version: z.number().int().positive(),
  displayName: z.string().trim().min(2).max(80),
  category: z.literal('before_after_video'),
  aspectRatio: z.enum(templateAspectRatioKeys),
  background: z.object({ colorToken: z.enum(['canvas', 'surface', 'white']) }).strict(),
  segments: z.array(videoTemplateSegmentSchema).min(1).max(MAX_TEMPLATE_SEGMENTS),
  transitions: z.array(videoTemplateTransitionSchema).max(MAX_TEMPLATE_SEGMENTS - 1),
  overlays: z.array(videoTextOverlaySchema).max(MAX_TEMPLATE_OVERLAYS),
  editableLabels: z.array(z.enum(editableTemplateTextKeys)).min(0).max(4),
  allowedStyleTokens: z.array(z.enum(templateStyleTokens)).min(1).max(templateStyleTokens.length),
  audio: videoTemplateAudioCapabilitySchema,
}).strict();
export type VideoTemplateDefinition = z.infer<typeof videoTemplateDefinitionSchema>;

export type VideoTemplateValidationIssue = { readonly template: string; readonly message: string };

const unique = (values: readonly string[]) => new Set(values).size === values.length;

/**
 * Structural validation only (shape, uniqueness, referential integrity). Total-duration
 * bounds and transition-fits-in-preceding-segment checks are cross-cutting with the
 * document's own duration policy and are re-verified by the document schema and the
 * evaluator — see video-composition.ts.
 */
export function validateVideoTemplateDefinition(input: unknown): VideoTemplateDefinition {
  const template = videoTemplateDefinitionSchema.parse(input);
  const issue = (message: string): never => { throw new Error(`Video template ${template.id}@${template.version}: ${message}`); };
  if (!unique(template.segments.map((segment) => segment.id))) issue('segment IDs must be unique.');
  if (!unique(template.transitions.map((transition) => transition.afterSegmentId))) issue('at most one transition may follow a given segment.');
  if (!unique(template.overlays.map((overlay) => overlay.id))) issue('overlay IDs must be unique.');
  if (!unique(template.overlays.map((overlay) => String(overlay.zIndex)))) issue('overlay z-order must be unique and deterministic.');
  if (!unique(template.editableLabels)) issue('editable labels must be unique.');
  if (!unique(template.allowedStyleTokens)) issue('allowed style tokens must be unique.');
  const segmentIds = new Set(template.segments.map((segment) => segment.id));
  for (const transition of template.transitions) {
    if (!segmentIds.has(transition.afterSegmentId)) issue(`transition references an unknown segment: ${transition.afterSegmentId}.`);
  }
  const lastSegmentId = template.segments[template.segments.length - 1]?.id;
  if (lastSegmentId !== undefined && template.transitions.some((transition) => transition.afterSegmentId === lastSegmentId)) {
    issue('the final segment must not have an outgoing transition.');
  }
  for (const transition of template.transitions) {
    const segment = template.segments.find((candidate) => candidate.id === transition.afterSegmentId);
    if (segment !== undefined && transition.durationMs > segment.defaultDurationMs) {
      issue(`transition after ${transition.afterSegmentId} cannot exceed that segment's own default duration.`);
    }
  }
  const totalDurationMs = template.segments.reduce((total, segment) => total + segment.defaultDurationMs, 0);
  if (totalDurationMs < MIN_VIDEO_DURATION_MS || totalDurationMs > MAX_VIDEO_DURATION_MS) {
    issue(`total duration (${totalDurationMs}ms) must be between ${MIN_VIDEO_DURATION_MS}ms and ${MAX_VIDEO_DURATION_MS}ms — no VideoCompositionDocumentV1 could legally represent it otherwise.`);
  }
  for (const overlay of template.overlays) {
    if (overlay.visibleFromMs >= totalDurationMs) issue(`overlay ${overlay.id} starts at or after the template's own total duration (${totalDurationMs}ms).`);
    if (overlay.visibleToMs > totalDurationMs) issue(`overlay ${overlay.id} ends after the template's own total duration (${totalDurationMs}ms).`);
  }
  const textOverlays = template.overlays;
  const overlayKeys = new Set(textOverlays.map((overlay) => overlay.textKey));
  if (!template.editableLabels.every((key) => overlayKeys.has(key))) issue('every editable label must have one declared overlay.');
  if (!template.allowedStyleTokens.includes('clinical-neutral')) issue('clinical-neutral must remain a supported safe fallback style.');
  const bindingKeysUsed = new Set(template.segments.map((segment) => segment.bindingKey));
  if (![...bindingKeysUsed].every((key) => key === 'before' || key === 'after')) issue('segments must bind only to before/after.');
  return template;
}

export function validateVideoTemplateCatalog(input: readonly unknown[]): readonly VideoTemplateDefinition[] {
  const catalog = input.map(validateVideoTemplateDefinition);
  const identities = catalog.map((template) => `${template.id}@${template.version}`);
  if (!unique(identities)) throw new Error('Video template catalog contains duplicate template identities.');
  return catalog;
}
