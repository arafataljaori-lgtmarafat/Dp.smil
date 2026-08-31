import { describe, expect, it } from 'vitest';

import {
  validateVideoTemplateDefinition,
  validateVideoTemplateCatalog,
  MIN_SEGMENT_DURATION_MS,
  MAX_SEGMENT_DURATION_MS,
  type VideoTemplateDefinition,
} from '../index.js';

const baseTemplate: VideoTemplateDefinition = {
  id: 'classic-reveal',
  version: 1,
  displayName: 'Classic Reveal',
  category: 'before_after_video',
  aspectRatio: 'portrait_4_5',
  background: { colorToken: 'canvas' },
  segments: [
    {
      id: 'seg-before',
      bindingKey: 'before',
      defaultDurationMs: 2_000,
      slotRect: { x: 0.05, y: 0.1, width: 0.9, height: 0.8 },
      fit: 'cover',
      cornerRadius: 0.02,
      motion: { type: 'static', transform: { panX: 0, panY: 0, scale: 1 } },
    },
    {
      id: 'seg-after',
      bindingKey: 'after',
      defaultDurationMs: 2_000,
      slotRect: { x: 0.05, y: 0.1, width: 0.9, height: 0.8 },
      fit: 'cover',
      cornerRadius: 0.02,
      motion: { type: 'panZoom', from: { panX: 0, panY: 0, scale: 1 }, to: { panX: 0, panY: 0, scale: 1.1 }, easing: 'easeInOutCubic' },
    },
  ],
  transitions: [{ afterSegmentId: 'seg-before', type: 'crossfade', durationMs: 500 }],
  overlays: [
    { id: 'label-before', type: 'text', zIndex: 10, visibleFromMs: 0, visibleToMs: 2_000, textKey: 'beforeLabel', rect: { x: 0.05, y: 0.02, width: 0.4, height: 0.06 }, colorToken: 'ink', fontScale: 0.045, align: 'left' },
    { id: 'label-after', type: 'text', zIndex: 11, visibleFromMs: 2_000, visibleToMs: 4_000, textKey: 'afterLabel', rect: { x: 0.55, y: 0.02, width: 0.4, height: 0.06 }, colorToken: 'ink', fontScale: 0.045, align: 'right' },
  ],
  editableLabels: ['beforeLabel', 'afterLabel'],
  allowedStyleTokens: ['clinical-neutral', 'clinical-blue'],
  audio: { acceptsAudioReference: false },
};

describe('Video template contract', () => {
  it('accepts a well-formed template', () => {
    expect(validateVideoTemplateDefinition(baseTemplate)).toEqual(baseTemplate);
  });

  it('rejects duplicate segment IDs', () => {
    const invalid = { ...baseTemplate, segments: [baseTemplate.segments[0], baseTemplate.segments[0]] };
    expect(() => validateVideoTemplateDefinition(invalid)).toThrow(/segment IDs must be unique/);
  });

  it('rejects a transition referencing an unknown segment', () => {
    const invalid = { ...baseTemplate, transitions: [{ afterSegmentId: 'does-not-exist', type: 'crossfade' as const, durationMs: 500 }] };
    expect(() => validateVideoTemplateDefinition(invalid)).toThrow(/unknown segment/);
  });

  it('rejects an outgoing transition on the final segment', () => {
    const invalid = { ...baseTemplate, transitions: [...baseTemplate.transitions, { afterSegmentId: 'seg-after', type: 'crossfade' as const, durationMs: 400 }] };
    expect(() => validateVideoTemplateDefinition(invalid)).toThrow(/final segment must not have an outgoing transition/);
  });

  it("rejects a transition duration exceeding its own segment's default duration", () => {
    const shortFirstSegment = { ...baseTemplate.segments[0], defaultDurationMs: MIN_SEGMENT_DURATION_MS };
    const invalid = {
      ...baseTemplate,
      segments: [shortFirstSegment, baseTemplate.segments[1]],
      transitions: [{ afterSegmentId: 'seg-before', type: 'crossfade' as const, durationMs: MIN_SEGMENT_DURATION_MS + 200 }],
    };
    expect(() => validateVideoTemplateDefinition(invalid)).toThrow(/cannot exceed that segment's own default duration/);
  });

  it('rejects duplicate/non-deterministic overlay z-order', () => {
    const [firstOverlay, secondOverlay] = baseTemplate.overlays;
    if (firstOverlay === undefined || secondOverlay === undefined) throw new Error('Fixture must declare two overlays.');
    const invalid = { ...baseTemplate, overlays: [firstOverlay, { ...secondOverlay, zIndex: firstOverlay.zIndex }] };
    expect(() => validateVideoTemplateDefinition(invalid)).toThrow(/z-order must be unique/);
  });

  it('rejects an editable label with no declared overlay', () => {
    const invalid = { ...baseTemplate, editableLabels: ['beforeLabel', 'afterLabel', 'title'] as const };
    expect(() => validateVideoTemplateDefinition(invalid)).toThrow(/every editable label must have one declared overlay/);
  });

  it('rejects a catalog dropping the clinical-neutral safe fallback', () => {
    const invalid = { ...baseTemplate, allowedStyleTokens: ['clinical-blue'] as const };
    expect(() => validateVideoTemplateDefinition(invalid)).toThrow(/clinical-neutral must remain/);
  });

  it('rejects malformed overlay visibility windows', () => {
    const invalid = { ...baseTemplate, overlays: [{ ...baseTemplate.overlays[0], visibleFromMs: 1_000, visibleToMs: 1_000 }] };
    expect(() => validateVideoTemplateDefinition(invalid)).toThrow();
  });

  it('validates a catalog and rejects duplicate template identities', () => {
    expect(validateVideoTemplateCatalog([baseTemplate])).toEqual([baseTemplate]);
    expect(() => validateVideoTemplateCatalog([baseTemplate, baseTemplate])).toThrow(/duplicate template identities/);
  });

  it('rejects a template whose total duration exceeds the maximum a document could ever legally represent', () => {
    const longSegment = { ...baseTemplate.segments[0], id: 'long', defaultDurationMs: MAX_SEGMENT_DURATION_MS };
    const invalid = {
      ...baseTemplate,
      segments: [longSegment, { ...longSegment, id: 'long-2' }, { ...longSegment, id: 'long-3' }, { ...baseTemplate.segments[1], id: 'long-4', defaultDurationMs: MAX_SEGMENT_DURATION_MS }],
      transitions: [],
      overlays: [],
      editableLabels: [],
    };
    // 4 * 20_000ms = 80_000ms, exceeding MAX_VIDEO_DURATION_MS (60_000ms).
    expect(() => validateVideoTemplateDefinition(invalid)).toThrow(/total duration/);
  });

  it('rejects a template whose total duration falls below the minimum a document could ever legally represent', () => {
    const invalid = {
      ...baseTemplate,
      segments: [{ ...baseTemplate.segments[0], defaultDurationMs: MIN_SEGMENT_DURATION_MS }],
      transitions: [],
      overlays: [],
      editableLabels: [],
    };
    // A single 300ms segment falls below MIN_VIDEO_DURATION_MS (1_000ms).
    expect(() => validateVideoTemplateDefinition(invalid)).toThrow(/total duration/);
  });

  it('rejects an overlay that starts at or after the template total duration', () => {
    const invalid = { ...baseTemplate, overlays: [{ ...baseTemplate.overlays[0], visibleFromMs: 4_000, visibleToMs: 4_500 }] };
    expect(() => validateVideoTemplateDefinition(invalid)).toThrow(/starts at or after/);
  });

  it('rejects an overlay that ends after the template total duration', () => {
    const invalid = { ...baseTemplate, overlays: [{ ...baseTemplate.overlays[0], visibleFromMs: 0, visibleToMs: 5_000 }] };
    expect(() => validateVideoTemplateDefinition(invalid)).toThrow(/ends after/);
  });

  it('accepts an overlay whose visibleToMs lands exactly on the template total duration (inclusive boundary)', () => {
    const validAtBoundary = { ...baseTemplate, overlays: [baseTemplate.overlays[0], { ...baseTemplate.overlays[1], visibleFromMs: 3_500, visibleToMs: 4_000 }] };
    expect(() => validateVideoTemplateDefinition(validAtBoundary)).not.toThrow();
  });
});
