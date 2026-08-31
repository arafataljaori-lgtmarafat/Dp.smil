import type {
  CreationBindingKey,
  VideoCompositionDocument,
  VideoTemplateDefinition,
  VideoTemplateSegment,
  VideoTemplateTransition,
  MotionPrimitive,
  EasingKey,
  TemplateStyleToken,
} from '@dentpilot/contracts';
import { videoCompositionDocumentV1Schema } from '@dentpilot/contracts';

import {
  aspectRatioValue,
  normalizedRectToPixels,
  resolveImagePlacement,
  resolveRenderCanvas,
  type CreationRenderAsset,
  type PixelRect,
  type RenderCommand,
  type RenderTarget,
  type RenderTransform,
} from './composition-engine.js';

/**
 * Pure deterministic temporal evaluator for VideoCompositionDocumentV1.
 *
 * evaluateVideoCompositionAtTime(document, template, assets, timeMs, target) always
 * returns the same VideoRenderPlanAtTime for the same inputs. It performs no I/O, reads
 * no system clock, never mutates its inputs, and has no dependency on React/React
 * Native, an encoder, or an AI provider — see docs/phase-5-stage-1-temporal-invariants.md
 * for the complete invariant list this file upholds.
 *
 * Time semantics: every segment occupies a half-open interval [startMs, endMs) except
 * that the single instant timeMs === document.durationMs (the very final frame) is
 * mapped onto the last segment, evaluated at its own final instant. There is no other
 * inclusive/exclusive ambiguity anywhere in this evaluator.
 */

export class VideoCompositionEvaluationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'VideoCompositionEvaluationError';
  }
}

export type VideoRenderCommand = RenderCommand & { readonly opacity: number };

export type VideoRenderPlanAtTime = {
  readonly schemaVersion: 1;
  readonly timeMs: number;
  readonly template: { readonly id: string; readonly version: number; readonly aspectRatio: VideoTemplateDefinition['aspectRatio'] };
  readonly canvas: RenderTarget;
  readonly styleToken: TemplateStyleToken;
  readonly commands: readonly VideoRenderCommand[];
};

type SegmentBoundary = { readonly segment: VideoTemplateSegment; readonly startMs: number; readonly endMs: number };

function buildSegmentBoundaries(template: VideoTemplateDefinition): readonly SegmentBoundary[] {
  let cursor = 0;
  return template.segments.map((segment) => {
    const startMs = cursor;
    cursor += segment.defaultDurationMs;
    return { segment, startMs, endMs: cursor };
  });
}

export function resolveVideoTemplateDurationMs(template: VideoTemplateDefinition): number {
  return template.segments.reduce((total, segment) => total + segment.defaultDurationMs, 0);
}

export function resolveVideoTemplateForDocument(input: {
  readonly document: VideoCompositionDocument;
  readonly template: VideoTemplateDefinition;
}): VideoTemplateDefinition {
  const document = videoCompositionDocumentV1Schema.parse(input.document);
  const template = input.template;
  if (document.templateRef.templateId !== template.id || document.templateRef.templateVersion !== template.version) {
    throw new VideoCompositionEvaluationError('Video composition document template reference does not match the resolved template.');
  }
  if (document.canvas.aspectRatioKey !== template.aspectRatio) {
    throw new VideoCompositionEvaluationError(`Video composition document aspect ratio does not match ${template.id}@${template.version}.`);
  }
  if (!template.allowedStyleTokens.includes(document.styleState.theme)) {
    throw new VideoCompositionEvaluationError(`Video composition document style is not allowed by ${template.id}@${template.version}.`);
  }
  const resolvedDuration = resolveVideoTemplateDurationMs(template);
  if (document.durationMs !== resolvedDuration) {
    throw new VideoCompositionEvaluationError(
      `Video composition document durationMs (${document.durationMs}) does not match the resolved template's total duration (${resolvedDuration}). Per-document duration overrides are not supported in this stage.`,
    );
  }
  if (document.audioRef !== null && !template.audio.acceptsAudioReference) {
    throw new VideoCompositionEvaluationError(
      `Video composition document supplies an audio reference, but ${template.id}@${template.version} does not accept one.`,
    );
  }
  return template;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Deterministic, table-defined easing. Adding a new easing key requires adding it here and to easingKeys in the contract. Exported for precise, direct testing. */
export function applyEasing(easing: EasingKey, progress: number): number {
  const t = clamp01(progress);
  if (easing === 'linear') return t;
  // easeInOutCubic
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

/** Exported for precise, direct testing of interpolation without going through full plan evaluation. */
export function resolveMotionTransform(motion: MotionPrimitive, localTimeMs: number, segmentDurationMs: number): { readonly panX: number; readonly panY: number; readonly scale: number; readonly rotation: number } {  if (motion.type === 'static') {
    return { panX: motion.transform.panX, panY: motion.transform.panY, scale: motion.transform.scale, rotation: 0 };
  }
  const rawProgress = segmentDurationMs === 0 ? 1 : localTimeMs / segmentDurationMs;
  const eased = applyEasing(motion.easing, rawProgress);
  return {
    panX: motion.from.panX + (motion.to.panX - motion.from.panX) * eased,
    panY: motion.from.panY + (motion.to.panY - motion.from.panY) * eased,
    scale: motion.from.scale + (motion.to.scale - motion.from.scale) * eased,
    rotation: 0,
  };
}

function placementCommand(input: {
  readonly commandId: string;
  readonly zIndex: number;
  readonly opacity: number;
  readonly segment: VideoTemplateSegment;
  readonly asset: CreationRenderAsset;
  readonly localTimeMs: number;
  readonly segmentDurationMs: number;
  readonly canvas: RenderTarget;
  readonly clipOverride: PixelRect | null;
}): VideoRenderCommand {
  const { commandId, zIndex, opacity, segment, asset, localTimeMs, segmentDurationMs, canvas, clipOverride } = input;
  const fullClip = normalizedRectToPixels(segment.slotRect, canvas);
  const clip = clipOverride ?? fullClip;
  const resolvedTransform = resolveMotionTransform(segment.motion, localTimeMs, segmentDurationMs);
  const placement = resolveImagePlacement({
    sourceWidth: asset.width,
    sourceHeight: asset.height,
    slot: fullClip,
    fit: segment.fit,
    transform: resolvedTransform,
    allowsRotation: false,
  });
  return {
    type: 'image',
    id: commandId,
    zIndex,
    bindingKey: segment.bindingKey,
    mediaId: asset.mediaId,
    source: asset.source,
    destination: placement.destination,
    clip,
    cornerRadius: segment.cornerRadius * Math.min(canvas.width, canvas.height),
    transform: placement.transform,
    fit: segment.fit,
    opacity,
  };
}

/** A horizontal wipe clip: reveals the incoming image left-to-right as progress goes 0 -> 1. */
function revealClip(fullClip: PixelRect, progress: number): PixelRect {
  const width = fullClip.width * clamp01(progress);
  return { x: fullClip.x, y: fullClip.y, width, height: fullClip.height };
}

/** A symmetric center-out wipe: reveals the incoming image from the clip's vertical midline outward as progress goes 0 -> 1. */
function splitRevealClip(fullClip: PixelRect, progress: number): PixelRect {
  const halfWidth = (fullClip.width / 2) * clamp01(progress);
  const centerX = fullClip.x + fullClip.width / 2;
  return { x: centerX - halfWidth, y: fullClip.y, width: halfWidth * 2, height: fullClip.height };
}

function resolveOutgoingTransition(
  template: VideoTemplateDefinition,
  segment: VideoTemplateSegment,
): VideoTemplateTransition | null {
  return template.transitions.find((transition) => transition.afterSegmentId === segment.id) ?? null;
}

export function evaluateVideoCompositionAtTime(input: {
  readonly document: VideoCompositionDocument;
  readonly template: VideoTemplateDefinition;
  readonly assets: readonly CreationRenderAsset[];
  readonly timeMs: number;
  readonly target: RenderTarget;
}): VideoRenderPlanAtTime {
  const template = resolveVideoTemplateForDocument({ document: input.document, template: input.template });
  const document = videoCompositionDocumentV1Schema.parse(input.document);

  if (!Number.isInteger(input.timeMs)) {
    throw new VideoCompositionEvaluationError('timeMs must be an integer number of milliseconds.');
  }
  if (input.timeMs < 0 || input.timeMs > document.durationMs) {
    throw new VideoCompositionEvaluationError(`timeMs (${input.timeMs}) is out of range for a ${document.durationMs}ms composition.`);
  }

  const assets = new Map<CreationBindingKey, CreationRenderAsset>();
  for (const asset of input.assets) {
    if (assets.has(asset.bindingKey)) throw new VideoCompositionEvaluationError(`Duplicate render asset binding: ${asset.bindingKey}.`);
    if (!Number.isFinite(asset.width) || asset.width <= 0 || !Number.isFinite(asset.height) || asset.height <= 0) {
      throw new VideoCompositionEvaluationError(`Render asset dimensions are invalid for ${asset.bindingKey}.`);
    }
    if (!asset.source.startsWith('file://') && !asset.source.startsWith('dentpilot-private://')) {
      throw new VideoCompositionEvaluationError('Render assets must use a private local URI or authenticated renderer handle.');
    }
    assets.set(asset.bindingKey, asset);
  }
  const usedBindingKeys = new Set(template.segments.map((segment) => segment.bindingKey));
  for (const key of usedBindingKeys) {
    const asset = assets.get(key);
    const binding = document.assetBindings[key];
    if (asset === undefined || binding === undefined) {
      throw new VideoCompositionEvaluationError(`Video render plan lacks the required ${key} document state or media binding.`);
    }
    if (asset.mediaId !== binding.mediaId) {
      throw new VideoCompositionEvaluationError(
        `Render asset mediaId for ${key} (${asset.mediaId}) does not match the document's bound mediaId (${binding.mediaId}).`,
      );
    }
  }

  const boundaries = buildSegmentBoundaries(template);
  const atFinalInstant = input.timeMs === document.durationMs;
  const activeIndex = atFinalInstant
    ? boundaries.length - 1
    : boundaries.findIndex((boundary) => input.timeMs >= boundary.startMs && input.timeMs < boundary.endMs);
  const active = boundaries[activeIndex];
  if (active === undefined) {
    throw new VideoCompositionEvaluationError(`No segment covers timeMs (${input.timeMs}); the template's segments must exactly tile [0, durationMs].`);
  }
  const segmentDurationMs = active.endMs - active.startMs;
  const localTimeMs = atFinalInstant ? segmentDurationMs : input.timeMs - active.startMs;
  const activeAsset = assets.get(active.segment.bindingKey);
  if (activeAsset === undefined) throw new VideoCompositionEvaluationError(`Missing render asset for active segment binding ${active.segment.bindingKey}.`);

  const canvas = resolveRenderCanvas(template.aspectRatio, input.target);
  const commands: VideoRenderCommand[] = [
    { type: 'background', id: 'background', zIndex: 0, colorToken: template.background.colorToken, opacity: 1 },
  ];

  const outgoingTransition = resolveOutgoingTransition(template, active.segment);
  const inTailWindow = outgoingTransition !== null && localTimeMs >= segmentDurationMs - outgoingTransition.durationMs;

  if (!inTailWindow) {
    commands.push(placementCommand({
      commandId: `${active.segment.id}-image`,
      zIndex: 10,
      opacity: 1,
      segment: active.segment,
      asset: activeAsset,
      localTimeMs,
      segmentDurationMs,
      canvas,
      clipOverride: null,
    }));
  } else {
    const transition = outgoingTransition;
    const windowStart = segmentDurationMs - transition.durationMs;
    const progress = transition.durationMs === 0 ? 1 : clamp01((localTimeMs - windowStart) / transition.durationMs);
    const incoming = boundaries[activeIndex + 1];
    if (incoming === undefined) throw new VideoCompositionEvaluationError('Transition references a segment with no successor; this indicates a template validation gap.');
    const incomingAsset = assets.get(incoming.segment.bindingKey);
    if (incomingAsset === undefined) throw new VideoCompositionEvaluationError(`Missing render asset for incoming transition segment binding ${incoming.segment.bindingKey}.`);

    if (transition.type === 'crossfade') {
      commands.push(placementCommand({
        commandId: `${active.segment.id}-image`, zIndex: 10, opacity: 1 - progress,
        segment: active.segment, asset: activeAsset, localTimeMs, segmentDurationMs, canvas, clipOverride: null,
      }));
      commands.push(placementCommand({
        commandId: `${incoming.segment.id}-image-incoming`, zIndex: 11, opacity: progress,
        segment: incoming.segment, asset: incomingAsset, localTimeMs: 0, segmentDurationMs: incoming.endMs - incoming.startMs, canvas, clipOverride: null,
      }));
    } else {
      // The incoming image is what is being revealed, so the wipe clip must be derived
      // from the incoming segment's own slot geometry, not the outgoing segment's.
      const incomingFullClip = normalizedRectToPixels(incoming.segment.slotRect, canvas);
      const wipe = transition.type === 'reveal' ? revealClip(incomingFullClip, progress) : splitRevealClip(incomingFullClip, progress);
      commands.push(placementCommand({
        commandId: `${active.segment.id}-image`, zIndex: 10, opacity: 1,
        segment: active.segment, asset: activeAsset, localTimeMs, segmentDurationMs, canvas, clipOverride: null,
      }));
      commands.push(placementCommand({
        commandId: `${incoming.segment.id}-image-incoming`, zIndex: 11, opacity: 1,
        segment: incoming.segment, asset: incomingAsset, localTimeMs: 0, segmentDurationMs: incoming.endMs - incoming.startMs, canvas, clipOverride: wipe,
      }));
    }
  }

  for (const overlay of template.overlays) {
    const visible = input.timeMs >= overlay.visibleFromMs
      && (input.timeMs < overlay.visibleToMs || (atFinalInstant && overlay.visibleToMs === document.durationMs));
    if (!visible) continue;
    const text = document.editableTextState[overlay.textKey];
    if (text === undefined || text.length === 0) continue;
    commands.push({
      type: 'text',
      id: overlay.id,
      zIndex: overlay.zIndex,
      text,
      rect: normalizedRectToPixels(overlay.rect, canvas),
      colorToken: overlay.colorToken,
      fontSize: overlay.fontScale * Math.min(canvas.width, canvas.height),
      align: overlay.align,
      opacity: 1,
    });
  }

  commands.sort((left, right) => left.zIndex - right.zIndex);

  return {
    schemaVersion: 1,
    timeMs: input.timeMs,
    template: { id: template.id, version: template.version, aspectRatio: template.aspectRatio },
    canvas,
    styleToken: document.styleState.theme,
    commands,
  };
}

export { aspectRatioValue };
export type { RenderTarget, RenderTransform, PixelRect };
