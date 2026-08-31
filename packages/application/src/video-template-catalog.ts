import {
  validateVideoTemplateCatalog,
  type VideoTemplateDefinition,
} from '@dentpilot/contracts';

/**
 * Minimum reference video template catalog for this architectural-foundation stage.
 * One template, exercising static motion, panZoom (Ken Burns) motion, and a crossfade
 * transition — enough to prove the contract and evaluator are sound end-to-end. Visual
 * polish and a fuller catalog are explicitly out of scope (see
 * docs/phase-5-roadmap-after-architectural-rebase.md).
 */
const catalogSource = [
  {
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
        slotRect: { x: 0.06, y: 0.14, width: 0.88, height: 0.72 },
        fit: 'cover',
        cornerRadius: 0.02,
        motion: { type: 'static', transform: { panX: 0, panY: 0, scale: 1 } },
      },
      {
        id: 'seg-after',
        bindingKey: 'after',
        defaultDurationMs: 2_500,
        slotRect: { x: 0.06, y: 0.14, width: 0.88, height: 0.72 },
        fit: 'cover',
        cornerRadius: 0.02,
        motion: { type: 'panZoom', from: { panX: 0, panY: 0, scale: 1 }, to: { panX: 0.15, panY: -0.1, scale: 1.12 }, easing: 'easeInOutCubic' },
      },
    ],
    transitions: [{ afterSegmentId: 'seg-before', type: 'crossfade', durationMs: 500 }],
    overlays: [
      { id: 'label-before', type: 'text', zIndex: 20, visibleFromMs: 0, visibleToMs: 2_000, textKey: 'beforeLabel', rect: { x: 0.06, y: 0.03, width: 0.4, height: 0.06 }, colorToken: 'ink', fontScale: 0.045, align: 'left' },
      { id: 'label-after', type: 'text', zIndex: 21, visibleFromMs: 2_000, visibleToMs: 4_500, textKey: 'afterLabel', rect: { x: 0.54, y: 0.03, width: 0.4, height: 0.06 }, colorToken: 'ink', fontScale: 0.045, align: 'right' },
      { id: 'title', type: 'text', zIndex: 22, visibleFromMs: 0, visibleToMs: 4_500, textKey: 'title', rect: { x: 0.06, y: 0.9, width: 0.88, height: 0.06 }, colorToken: 'muted', fontScale: 0.035, align: 'center' },
    ],
    editableLabels: ['beforeLabel', 'afterLabel', 'title'],
    allowedStyleTokens: ['clinical-neutral', 'clinical-blue', 'clinical-warm'],
    audio: { acceptsAudioReference: false },
  },
] as const;

export const builtInVideoTemplateCatalog: readonly VideoTemplateDefinition[] = validateVideoTemplateCatalog(catalogSource);

export const defaultVideoTemplateRef = {
  templateId: 'classic-reveal',
  templateVersion: 1,
} as const;

export function resolveBuiltInVideoTemplate(templateId: string, templateVersion: number): VideoTemplateDefinition | null {
  return builtInVideoTemplateCatalog.find((template) => template.id === templateId && template.version === templateVersion) ?? null;
}

export function requireBuiltInVideoTemplate(templateId: string, templateVersion: number): VideoTemplateDefinition {
  const template = resolveBuiltInVideoTemplate(templateId, templateVersion);
  if (template === null) throw new Error(`Unknown built-in video template identity: ${templateId}@${templateVersion}.`);
  return template;
}
