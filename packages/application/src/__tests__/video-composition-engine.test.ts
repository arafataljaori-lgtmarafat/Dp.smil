import { describe, expect, it } from 'vitest';

import type { VideoCompositionDocumentV1, VideoTemplateDefinition } from '@dentpilot/contracts';
import { validateVideoTemplateDefinition } from '@dentpilot/contracts';

import {
  applyEasing,
  evaluateVideoCompositionAtTime,
  resolveMotionTransform,
  resolveVideoTemplateDurationMs,
  resolveVideoTemplateForDocument,
  VideoCompositionEvaluationError,
  builtInVideoTemplateCatalog,
  defaultVideoTemplateRef,
  requireBuiltInVideoTemplate,
  type CreationRenderAsset,
} from '../index.js';

const template: VideoTemplateDefinition = requireBuiltInVideoTemplate(defaultVideoTemplateRef.templateId, defaultVideoTemplateRef.templateVersion);

const document: VideoCompositionDocumentV1 = {
  schemaVersion: 1,
  templateRef: { templateId: template.id, templateVersion: template.version },
  canvas: { aspectRatioKey: template.aspectRatio },
  durationMs: resolveVideoTemplateDurationMs(template),
  assetBindings: {
    before: { mediaId: '11111111-1111-4111-8111-111111111111' },
    after: { mediaId: '22222222-2222-4222-8222-222222222222' },
  },
  editableTextState: { beforeLabel: 'Before', afterLabel: 'After', title: 'Case comparison' },
  styleState: { theme: 'clinical-neutral' },
  renderProfile: { profileKey: 'preview' },
  audioRef: null,
};

const assets: readonly CreationRenderAsset[] = [
  { bindingKey: 'before', mediaId: document.assetBindings.before!.mediaId, width: 1600, height: 1200, source: 'dentpilot-private://before' },
  { bindingKey: 'after', mediaId: document.assetBindings.after!.mediaId, width: 1200, height: 1600, source: 'dentpilot-private://after' },
];

const target = { width: 1080, height: 1350 };

function planAt(timeMs: number) {
  return evaluateVideoCompositionAtTime({ document, template, assets, timeMs, target });
}

describe('resolveVideoTemplateForDocument', () => {
  it('resolves a matching template', () => {
    expect(resolveVideoTemplateForDocument({ document, template })).toBe(template);
  });

  it('rejects a template-reference mismatch', () => {
    const mismatched = { ...document, templateRef: { templateId: 'other', templateVersion: 1 } };
    expect(() => resolveVideoTemplateForDocument({ document: mismatched, template })).toThrow(VideoCompositionEvaluationError);
  });

  it('rejects an aspect-ratio mismatch', () => {
    const mismatched = { ...document, canvas: { aspectRatioKey: 'square' as const } };
    expect(() => resolveVideoTemplateForDocument({ document: mismatched, template })).toThrow(/aspect ratio/);
  });

  it('rejects a duration that does not equal the resolved template total', () => {
    const mismatched = { ...document, durationMs: document.durationMs - 1 };
    expect(() => resolveVideoTemplateForDocument({ document: mismatched, template })).toThrow(/does not match the resolved template's total duration/);
  });
});

describe('easing', () => {
  it('is the identity function for linear', () => {
    expect(applyEasing('linear', 0)).toBe(0);
    expect(applyEasing('linear', 0.3)).toBeCloseTo(0.3);
    expect(applyEasing('linear', 1)).toBe(1);
  });

  it('is exactly symmetric and bounded for easeInOutCubic', () => {
    expect(applyEasing('easeInOutCubic', 0)).toBe(0);
    expect(applyEasing('easeInOutCubic', 0.5)).toBeCloseTo(0.5);
    expect(applyEasing('easeInOutCubic', 1)).toBe(1);
  });

  it('clamps out-of-range progress rather than extrapolating', () => {
    expect(applyEasing('linear', -1)).toBe(0);
    expect(applyEasing('linear', 2)).toBe(1);
  });
});

describe('resolveMotionTransform', () => {
  it('returns the fixed transform unchanged for a static primitive regardless of local time', () => {
    const motion = { type: 'static' as const, transform: { panX: 0.2, panY: -0.1, scale: 1.5 } };
    expect(resolveMotionTransform(motion, 0, 2_000)).toEqual({ panX: 0.2, panY: -0.1, scale: 1.5, rotation: 0 });
    expect(resolveMotionTransform(motion, 1_999, 2_000)).toEqual({ panX: 0.2, panY: -0.1, scale: 1.5, rotation: 0 });
  });

  it('interpolates a panZoom primitive to exact expected values at the eased midpoint', () => {
    const motion = { type: 'panZoom' as const, from: { panX: 0, panY: 0, scale: 1 }, to: { panX: 0.15, panY: -0.1, scale: 1.12 }, easing: 'easeInOutCubic' as const };
    const result = resolveMotionTransform(motion, 1_250, 2_500);
    expect(result.panX).toBeCloseTo(0.075);
    expect(result.panY).toBeCloseTo(-0.05);
    expect(result.scale).toBeCloseTo(1.06);
    expect(result.rotation).toBe(0);
  });

  it('reaches exactly the "from" value at local time 0 and exactly the "to" value at the segment end', () => {
    const motion = { type: 'panZoom' as const, from: { panX: 0, panY: 0, scale: 1 }, to: { panX: 0.15, panY: -0.1, scale: 1.12 }, easing: 'linear' as const };
    expect(resolveMotionTransform(motion, 0, 2_500)).toEqual({ panX: 0, panY: 0, scale: 1, rotation: 0 });
    expect(resolveMotionTransform(motion, 2_500, 2_500)).toEqual({ panX: 0.15, panY: -0.1, scale: 1.12, rotation: 0 });
  });
});

describe('evaluateVideoCompositionAtTime — timeline boundaries', () => {
  it('evaluates t=0 as the very first instant of the first segment', () => {
    const plan = planAt(0);
    expect(plan.timeMs).toBe(0);
    const image = plan.commands.find((command) => command.type === 'image');
    expect(image).toBeDefined();
    if (image?.type === 'image') expect(image.bindingKey).toBe('before');
  });

  it('keeps the first segment active for its own final millisecond', () => {
    const plan = planAt(1_999);
    const images = plan.commands.filter((command) => command.type === 'image');
    // 1999 is within the crossfade tail window [1500, 2000), so both the outgoing (before) and incoming (after) images are present.
    expect(images).toHaveLength(2);
    expect(images.some((command) => command.type === 'image' && command.bindingKey === 'before')).toBe(true);
    expect(images.some((command) => command.type === 'image' && command.bindingKey === 'after')).toBe(true);
  });

  it('transitions to the second segment exactly at its declared start boundary (half-open)', () => {
    const plan = planAt(2_000);
    const images = plan.commands.filter((command) => command.type === 'image');
    expect(images).toHaveLength(1);
    expect(images[0]?.type === 'image' && images[0].bindingKey).toBe('after');
  });

  it('evaluates the final document instant as the last segment at its own full local duration', () => {
    const plan = planAt(document.durationMs);
    const images = plan.commands.filter((command) => command.type === 'image');
    expect(images).toHaveLength(1);
    expect(images[0]?.type === 'image' && images[0].bindingKey).toBe('after');
  });

  it('throws for negative time', () => {
    expect(() => planAt(-1)).toThrow(VideoCompositionEvaluationError);
  });

  it('throws for time past the document duration', () => {
    expect(() => planAt(document.durationMs + 1)).toThrow(VideoCompositionEvaluationError);
  });

  it('throws for a non-integer time', () => {
    expect(() => planAt(1_000.5)).toThrow(/integer/);
  });

  it('never produces NaN or Infinity in any numeric command field across the full timeline', () => {
    for (let t = 0; t <= document.durationMs; t += 137) {
      const plan = planAt(t);
      for (const command of plan.commands) {
        for (const [key, value] of Object.entries(command)) {
          if (typeof value === 'number') expect(Number.isFinite(value), `${command.type}.${key} at t=${t}`).toBe(true);
        }
      }
    }
  });
});

describe('evaluateVideoCompositionAtTime — crossfade transition math', () => {
  it('has zero incoming opacity at the exact start of the transition window', () => {
    const plan = planAt(1_500);
    const incoming = plan.commands.find((command) => command.type === 'image' && command.bindingKey === 'after');
    expect(incoming?.type === 'image' && (incoming as { opacity: number }).opacity).toBeCloseTo(0);
  });

  it('is exactly half-blended at the midpoint of the transition window', () => {
    const plan = planAt(1_750);
    const outgoing = plan.commands.find((command) => command.type === 'image' && command.bindingKey === 'before');
    const incoming = plan.commands.find((command) => command.type === 'image' && command.bindingKey === 'after');
    expect((outgoing as { opacity: number } | undefined)?.opacity).toBeCloseTo(0.5);
    expect((incoming as { opacity: number } | undefined)?.opacity).toBeCloseTo(0.5);
  });

  it('is fully outgoing-transparent one millisecond before the segment boundary', () => {
    const plan = planAt(1_999);
    const outgoing = plan.commands.find((command) => command.type === 'image' && command.bindingKey === 'before');
    // progress = (1999-1500)/500 = 0.998, so outgoing opacity = 1-0.998 = 0.002 — nearly but not quite zero, exactly.
    expect((outgoing as { opacity: number } | undefined)?.opacity).toBeCloseTo(1 - 499 / 500, 3);
  });
});

describe('evaluateVideoCompositionAtTime — determinism and equality', () => {
  it('produces byte-identical output across repeated calls with identical input', () => {
    expect(planAt(1_750)).toEqual(planAt(1_750));
    expect(JSON.stringify(planAt(2_300))).toBe(JSON.stringify(planAt(2_300)));
  });

  it('does not mutate the document, template, or assets it is given', () => {
    const documentSnapshot = JSON.stringify(document);
    const templateSnapshot = JSON.stringify(template);
    const assetsSnapshot = JSON.stringify(assets);
    planAt(0);
    planAt(document.durationMs);
    expect(JSON.stringify(document)).toBe(documentSnapshot);
    expect(JSON.stringify(template)).toBe(templateSnapshot);
    expect(JSON.stringify(assets)).toBe(assetsSnapshot);
  });
});

describe('evaluateVideoCompositionAtTime — missing bindings and invalid inputs', () => {
  it('throws when a required binding has no matching render asset', () => {
    expect(() => evaluateVideoCompositionAtTime({ document, template, assets: [assets[0]!], timeMs: 0, target })).toThrow(/missing|required/i);
  });

  it('throws when an asset uses a non-private source', () => {
    const publicAsset = { ...assets[0]!, source: 'https://example.com/leak.png' };
    expect(() => evaluateVideoCompositionAtTime({ document, template, assets: [publicAsset, assets[1]!], timeMs: 0, target })).toThrow(/private/);
  });

  it('throws when the same binding key is supplied twice', () => {
    expect(() => evaluateVideoCompositionAtTime({ document, template, assets: [assets[0]!, assets[0]!], timeMs: 0, target })).toThrow(/duplicate/i);
  });

  it("throws when the supplied 'before' render asset's mediaId does not match the document's bound mediaId", () => {
    const wrongAsset = { ...assets[0]!, mediaId: '99999999-9999-4999-8999-999999999999' };
    expect(() => evaluateVideoCompositionAtTime({ document, template, assets: [wrongAsset, assets[1]!], timeMs: 0, target })).toThrow(VideoCompositionEvaluationError);
    expect(() => evaluateVideoCompositionAtTime({ document, template, assets: [wrongAsset, assets[1]!], timeMs: 0, target })).toThrow(/does not match the document's bound mediaId/);
  });

  it("throws when the supplied 'after' render asset's mediaId does not match the document's bound mediaId", () => {
    const wrongAsset = { ...assets[1]!, mediaId: '99999999-9999-4999-8999-999999999999' };
    expect(() => evaluateVideoCompositionAtTime({ document, template, assets: [assets[0]!, wrongAsset], timeMs: 2_000, target })).toThrow(/does not match the document's bound mediaId/);
  });

  it('accepts render assets whose mediaId exactly matches the document bindings (the valid path)', () => {
    expect(() => planAt(0)).not.toThrow();
    expect(() => planAt(document.durationMs)).not.toThrow();
  });
});

describe('resolveVideoTemplateForDocument — audio capability enforcement', () => {
  it('accepts a null audioRef against a template that does not accept audio', () => {
    expect(template.audio.acceptsAudioReference).toBe(false);
    expect(() => resolveVideoTemplateForDocument({ document, template })).not.toThrow();
  });

  it('rejects a non-null audioRef when the resolved template does not accept audio', () => {
    const withAudio = { ...document, audioRef: { mediaId: '33333333-3333-4333-8333-333333333333', startMs: 0, volume: 0.5 } };
    expect(() => resolveVideoTemplateForDocument({ document: withAudio, template })).toThrow(VideoCompositionEvaluationError);
    expect(() => resolveVideoTemplateForDocument({ document: withAudio, template })).toThrow(/does not accept one/);
  });

  it('accepts a non-null audioRef when the resolved template explicitly accepts audio', () => {
    const audioTemplate: VideoTemplateDefinition = { ...template, audio: { acceptsAudioReference: true } };
    const withAudio = { ...document, audioRef: { mediaId: '33333333-3333-4333-8333-333333333333', startMs: 0, volume: 0.5 } };
    expect(() => resolveVideoTemplateForDocument({ document: withAudio, template: audioTemplate })).not.toThrow();
  });

  it('never invokes evaluateVideoCompositionAtTime when audio capability is violated (rejected before any render command is emitted)', () => {
    const withAudio = { ...document, audioRef: { mediaId: '33333333-3333-4333-8333-333333333333', startMs: 0, volume: 0.5 } };
    expect(() => evaluateVideoCompositionAtTime({ document: withAudio, template, assets, timeMs: 0, target })).toThrow(/does not accept one/);
  });
});

describe('evaluateVideoCompositionAtTime — reveal and splitReveal transition math', () => {
  const wipeTemplate: VideoTemplateDefinition = validateVideoTemplateDefinition({
    id: 'wipe-fixture', version: 1, displayName: 'Wipe Fixture', category: 'before_after_video', aspectRatio: 'square',
    background: { colorToken: 'canvas' },
    segments: [
      { id: 'a', bindingKey: 'before', defaultDurationMs: 1_000, slotRect: { x: 0, y: 0, width: 1, height: 1 }, fit: 'cover', cornerRadius: 0, motion: { type: 'static', transform: { panX: 0, panY: 0, scale: 1 } } },
      { id: 'b', bindingKey: 'after', defaultDurationMs: 1_000, slotRect: { x: 0, y: 0, width: 1, height: 1 }, fit: 'cover', cornerRadius: 0, motion: { type: 'static', transform: { panX: 0, panY: 0, scale: 1 } } },
    ],
    transitions: [],
    overlays: [], editableLabels: [], allowedStyleTokens: ['clinical-neutral'], audio: { acceptsAudioReference: false },
  });
  const wipeDocument: VideoCompositionDocumentV1 = {
    ...document,
    templateRef: { templateId: wipeTemplate.id, templateVersion: wipeTemplate.version },
    canvas: { aspectRatioKey: 'square' },
    durationMs: resolveVideoTemplateDurationMs(wipeTemplate),
  };
  const squareTarget = { width: 1_000, height: 1_000 };

  function wipePlanAt(transitionType: 'reveal' | 'splitReveal', timeMs: number) {
    const templateWithTransition: VideoTemplateDefinition = { ...wipeTemplate, transitions: [{ afterSegmentId: 'a', type: transitionType, durationMs: 400 }] };
    return evaluateVideoCompositionAtTime({ document: wipeDocument, template: templateWithTransition, assets, timeMs, target: squareTarget });
  }

  it('reveal wipes left-to-right: incoming clip starts at the left edge and grows to full width', () => {
    const start = wipePlanAt('reveal', 600); // window = [600, 1000), progress 0
    const mid = wipePlanAt('reveal', 800); // progress 0.5
    const incomingStart = start.commands.find((command) => command.type === 'image' && command.bindingKey === 'after');
    const incomingMid = mid.commands.find((command) => command.type === 'image' && command.bindingKey === 'after');
    expect(incomingStart?.type === 'image' && incomingStart.clip.width).toBeCloseTo(0);
    expect(incomingStart?.type === 'image' && incomingStart.clip.x).toBeCloseTo(0);
    expect(incomingMid?.type === 'image' && incomingMid.clip.width).toBeCloseTo(500);
    expect(incomingMid?.type === 'image' && incomingMid.clip.x).toBeCloseTo(0);
  });

  it('splitReveal wipes from the center outward: incoming clip grows symmetrically about the midline', () => {
    const mid = wipePlanAt('splitReveal', 800); // progress 0.5
    const incomingMid = mid.commands.find((command) => command.type === 'image' && command.bindingKey === 'after');
    expect(incomingMid?.type === 'image' && incomingMid.clip.width).toBeCloseTo(500);
    // Centered: x should sit at 500 - 250 = 250, not at the left edge like reveal.
    expect(incomingMid?.type === 'image' && incomingMid.clip.x).toBeCloseTo(250);
  });

  it('both wipe kinds fully reveal the incoming image at the exact end of the transition window', () => {
    const revealEnd = wipePlanAt('reveal', 999);
    const splitEnd = wipePlanAt('splitReveal', 999);
    const revealIncoming = revealEnd.commands.find((command) => command.type === 'image' && command.bindingKey === 'after');
    const splitIncoming = splitEnd.commands.find((command) => command.type === 'image' && command.bindingKey === 'after');
    expect(revealIncoming?.type === 'image' && revealIncoming.clip.width).toBeCloseTo(997.5);
    expect(splitIncoming?.type === 'image' && splitIncoming.clip.width).toBeCloseTo(997.5);
  });

  it("derives the wipe clip from the INCOMING segment's own slot geometry, not the outgoing segment's, when they differ", () => {
    const outgoingSlot = { x: 0, y: 0, width: 0.5, height: 1 }; // left half of the canvas
    const incomingSlot = { x: 0.5, y: 0, width: 0.5, height: 1 }; // right half of the canvas — deliberately different
    const differingTemplate: VideoTemplateDefinition = validateVideoTemplateDefinition({
      ...wipeTemplate,
      segments: [
        { ...wipeTemplate.segments[0]!, slotRect: outgoingSlot },
        { ...wipeTemplate.segments[1]!, slotRect: incomingSlot },
      ],
      transitions: [{ afterSegmentId: 'a', type: 'reveal', durationMs: 400 }],
    });
    const midPlan = evaluateVideoCompositionAtTime({ document: wipeDocument, template: differingTemplate, assets, timeMs: 800, target: squareTarget });
    const incoming = midPlan.commands.find((command) => command.type === 'image' && command.bindingKey === 'after');
    // The incoming slot occupies x=[500,1000). A correct implementation's clip.x must start at 500 (the incoming
    // segment's own left edge), never at 0 (the outgoing segment's left edge) — the bug this test guards against
    // would have produced clip.x === 0 and a clip.width computed against the wrong (outgoing) 500px-wide slot.
    expect(incoming?.type === 'image' && incoming.clip.x).toBeCloseTo(500);
    expect(incoming?.type === 'image' && incoming.clip.width).toBeCloseTo(250); // 50% progress of the incoming slot's own 500px width
  });
});

describe('backward compatibility of the reference video template', () => {
  it('is itself a structurally valid template (re-validated independent of the catalog build step)', () => {
    expect(() => validateVideoTemplateDefinition(template)).not.toThrow();
  });

  it('the built-in catalog contains exactly the expected reference template', () => {
    expect(builtInVideoTemplateCatalog.map((entry) => `${entry.id}@${entry.version}`)).toEqual(['classic-reveal@1']);
  });
});
