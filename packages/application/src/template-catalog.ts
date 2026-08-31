import {
  validateTemplateCatalog,
  type TemplateDefinition,
  type TemplateStyleToken,
} from '@dentpilot/contracts';

const labelLayers = (beforeRect: unknown, afterRect: unknown, startZIndex: number) => [
  { id: 'label-before', type: 'text', zIndex: startZIndex, textKey: 'beforeLabel', rect: beforeRect, colorToken: 'ink', fontScale: 0.045, align: 'left', visibleByDefault: true },
  { id: 'label-after', type: 'text', zIndex: startZIndex + 1, textKey: 'afterLabel', rect: afterRect, colorToken: 'ink', fontScale: 0.045, align: 'right', visibleByDefault: true },
];

const catalogSource = [
  {
    id: 'clean-side-by-side', version: 1, displayName: 'Clean Side-by-Side', category: 'before_after', aspectRatio: 'square',
    background: { colorToken: 'canvas' }, allowedStyleTokens: ['clinical-neutral', 'clinical-blue', 'clinical-warm'], editableLabels: ['beforeLabel', 'afterLabel'],
    slots: [
      { id: 'before-photo', bindingKey: 'before', rect: { x: 0.06, y: 0.18, width: 0.41, height: 0.68 }, fit: 'cover', cornerRadius: 0.025, allowsRotation: false },
      { id: 'after-photo', bindingKey: 'after', rect: { x: 0.53, y: 0.18, width: 0.41, height: 0.68 }, fit: 'cover', cornerRadius: 0.025, allowsRotation: false },
    ],
    layers: [
      { id: 'background', type: 'background', zIndex: 0, colorToken: 'canvas' },
      { id: 'before-photo-layer', type: 'imageSlot', zIndex: 10, slotId: 'before-photo' },
      { id: 'after-photo-layer', type: 'imageSlot', zIndex: 11, slotId: 'after-photo' },
      { id: 'center-divider', type: 'divider', zIndex: 20, start: { x: 0.5, y: 0.2 }, end: { x: 0.5, y: 0.82 }, colorToken: 'accent', width: 0.005 },
      ...labelLayers({ x: 0.06, y: 0.09, width: 0.41, height: 0.06 }, { x: 0.53, y: 0.09, width: 0.41, height: 0.06 }, 30),
    ],
  },
  {
    id: 'premium-split', version: 1, displayName: 'Premium Split', category: 'before_after', aspectRatio: 'portrait_4_5',
    background: { colorToken: 'canvas' }, allowedStyleTokens: ['clinical-neutral', 'clinical-blue'], editableLabels: ['beforeLabel', 'afterLabel', 'title'],
    slots: [
      { id: 'before-photo', bindingKey: 'before', rect: { x: 0.06, y: 0.18, width: 0.88, height: 0.31 }, fit: 'cover', cornerRadius: 0.025, allowsRotation: false },
      { id: 'after-photo', bindingKey: 'after', rect: { x: 0.06, y: 0.55, width: 0.88, height: 0.31 }, fit: 'cover', cornerRadius: 0.025, allowsRotation: false },
    ],
    layers: [
      { id: 'background', type: 'background', zIndex: 0, colorToken: 'canvas' },
      { id: 'header-rule', type: 'shape', zIndex: 5, rect: { x: 0.06, y: 0.1, width: 0.12, height: 0.01 }, fillToken: 'accent', cornerRadius: 0.005 },
      { id: 'before-photo-layer', type: 'imageSlot', zIndex: 10, slotId: 'before-photo' },
      { id: 'after-photo-layer', type: 'imageSlot', zIndex: 11, slotId: 'after-photo' },
      { id: 'split-divider', type: 'divider', zIndex: 20, start: { x: 0.06, y: 0.52 }, end: { x: 0.94, y: 0.52 }, colorToken: 'accentSoft', width: 0.003 },
      { id: 'title', type: 'text', zIndex: 30, textKey: 'title', rect: { x: 0.06, y: 0.035, width: 0.88, height: 0.05 }, colorToken: 'ink', fontScale: 0.045, align: 'left', visibleByDefault: true },
      ...labelLayers({ x: 0.08, y: 0.2, width: 0.35, height: 0.05 }, { x: 0.57, y: 0.57, width: 0.35, height: 0.05 }, 31),
    ],
  },
  {
    id: 'clinical-stacked', version: 1, displayName: 'Clinical Stacked', category: 'before_after', aspectRatio: 'portrait_4_5',
    background: { colorToken: 'surface' }, allowedStyleTokens: ['clinical-neutral', 'clinical-blue', 'clinical-warm'], editableLabels: ['beforeLabel', 'afterLabel'],
    slots: [
      { id: 'before-photo', bindingKey: 'before', rect: { x: 0.08, y: 0.1, width: 0.84, height: 0.36 }, fit: 'contain', cornerRadius: 0.015, allowsRotation: false },
      { id: 'after-photo', bindingKey: 'after', rect: { x: 0.08, y: 0.54, width: 0.84, height: 0.36 }, fit: 'contain', cornerRadius: 0.015, allowsRotation: false },
    ],
    layers: [
      { id: 'background', type: 'background', zIndex: 0, colorToken: 'surface' },
      { id: 'before-panel', type: 'shape', zIndex: 5, rect: { x: 0.06, y: 0.08, width: 0.88, height: 0.4 }, fillToken: 'white', cornerRadius: 0.025 },
      { id: 'after-panel', type: 'shape', zIndex: 6, rect: { x: 0.06, y: 0.52, width: 0.88, height: 0.4 }, fillToken: 'white', cornerRadius: 0.025 },
      { id: 'before-photo-layer', type: 'imageSlot', zIndex: 10, slotId: 'before-photo' },
      { id: 'after-photo-layer', type: 'imageSlot', zIndex: 11, slotId: 'after-photo' },
      ...labelLayers({ x: 0.1, y: 0.115, width: 0.3, height: 0.04 }, { x: 0.1, y: 0.555, width: 0.3, height: 0.04 }, 30),
    ],
  },
  {
    id: 'story-before-after', version: 1, displayName: 'Story Before/After', category: 'before_after', aspectRatio: 'story_9_16',
    background: { colorToken: 'canvas' }, allowedStyleTokens: ['clinical-neutral', 'clinical-blue', 'clinical-warm'], editableLabels: ['beforeLabel', 'afterLabel', 'title'],
    slots: [
      { id: 'before-photo', bindingKey: 'before', rect: { x: 0.05, y: 0.15, width: 0.9, height: 0.31 }, fit: 'cover', cornerRadius: 0.025, allowsRotation: true },
      { id: 'after-photo', bindingKey: 'after', rect: { x: 0.05, y: 0.54, width: 0.9, height: 0.31 }, fit: 'cover', cornerRadius: 0.025, allowsRotation: true },
    ],
    layers: [
      { id: 'background', type: 'background', zIndex: 0, colorToken: 'canvas' },
      { id: 'title', type: 'text', zIndex: 5, textKey: 'title', rect: { x: 0.08, y: 0.055, width: 0.84, height: 0.055 }, colorToken: 'ink', fontScale: 0.05, align: 'center', visibleByDefault: true },
      { id: 'before-photo-layer', type: 'imageSlot', zIndex: 10, slotId: 'before-photo' },
      { id: 'after-photo-layer', type: 'imageSlot', zIndex: 11, slotId: 'after-photo' },
      { id: 'story-divider', type: 'divider', zIndex: 20, start: { x: 0.16, y: 0.5 }, end: { x: 0.84, y: 0.5 }, colorToken: 'accent', width: 0.004 },
      ...labelLayers({ x: 0.08, y: 0.17, width: 0.3, height: 0.05 }, { x: 0.62, y: 0.56, width: 0.3, height: 0.05 }, 30),
    ],
  },
  {
    id: 'minimal-clinical', version: 1, displayName: 'Minimal Clinical', category: 'before_after', aspectRatio: 'square',
    background: { colorToken: 'white' }, allowedStyleTokens: ['clinical-neutral', 'clinical-blue'], editableLabels: ['beforeLabel', 'afterLabel'],
    slots: [
      { id: 'before-photo', bindingKey: 'before', rect: { x: 0.08, y: 0.22, width: 0.37, height: 0.56 }, fit: 'cover', cornerRadius: 0, allowsRotation: false },
      { id: 'after-photo', bindingKey: 'after', rect: { x: 0.55, y: 0.22, width: 0.37, height: 0.56 }, fit: 'cover', cornerRadius: 0, allowsRotation: false },
    ],
    layers: [
      { id: 'background', type: 'background', zIndex: 0, colorToken: 'white' },
      { id: 'before-photo-layer', type: 'imageSlot', zIndex: 10, slotId: 'before-photo' },
      { id: 'after-photo-layer', type: 'imageSlot', zIndex: 11, slotId: 'after-photo' },
      { id: 'minimal-divider', type: 'divider', zIndex: 20, start: { x: 0.5, y: 0.22 }, end: { x: 0.5, y: 0.78 }, colorToken: 'ink', width: 0.002 },
      ...labelLayers({ x: 0.08, y: 0.14, width: 0.37, height: 0.05 }, { x: 0.55, y: 0.14, width: 0.37, height: 0.05 }, 30),
    ],
  },
  {
    id: 'presentation-comparison', version: 1, displayName: 'Presentation Comparison', category: 'before_after', aspectRatio: 'landscape_16_9',
    background: { colorToken: 'canvas' }, allowedStyleTokens: ['clinical-neutral', 'clinical-blue', 'clinical-warm'], editableLabels: ['beforeLabel', 'afterLabel', 'title', 'subtitle'],
    slots: [
      { id: 'before-photo', bindingKey: 'before', rect: { x: 0.05, y: 0.24, width: 0.42, height: 0.6 }, fit: 'cover', cornerRadius: 0.018, allowsRotation: false },
      { id: 'after-photo', bindingKey: 'after', rect: { x: 0.53, y: 0.24, width: 0.42, height: 0.6 }, fit: 'cover', cornerRadius: 0.018, allowsRotation: false },
    ],
    layers: [
      { id: 'background', type: 'background', zIndex: 0, colorToken: 'canvas' },
      { id: 'title', type: 'text', zIndex: 5, textKey: 'title', rect: { x: 0.05, y: 0.055, width: 0.9, height: 0.07 }, colorToken: 'ink', fontScale: 0.05, align: 'left', visibleByDefault: true },
      { id: 'subtitle', type: 'text', zIndex: 6, textKey: 'subtitle', rect: { x: 0.05, y: 0.13, width: 0.9, height: 0.045 }, colorToken: 'muted', fontScale: 0.03, align: 'left', visibleByDefault: true },
      { id: 'before-photo-layer', type: 'imageSlot', zIndex: 10, slotId: 'before-photo' },
      { id: 'after-photo-layer', type: 'imageSlot', zIndex: 11, slotId: 'after-photo' },
      { id: 'presentation-divider', type: 'divider', zIndex: 20, start: { x: 0.5, y: 0.25 }, end: { x: 0.5, y: 0.83 }, colorToken: 'accent', width: 0.004 },
      ...labelLayers({ x: 0.07, y: 0.265, width: 0.34, height: 0.05 }, { x: 0.59, y: 0.265, width: 0.34, height: 0.05 }, 30),
    ],
  },
] as const;

/** Geometry changed for this published revision; v1 remains in the catalog for saved documents. */
const premiumSplitVersion2 = {
  ...catalogSource[1],
  version: 2,
  slots: [
    { id: 'before-photo', bindingKey: 'before', rect: { x: 0.06, y: 0.17, width: 0.88, height: 0.33 }, fit: 'cover', cornerRadius: 0.03, allowsRotation: false },
    { id: 'after-photo', bindingKey: 'after', rect: { x: 0.06, y: 0.54, width: 0.88, height: 0.33 }, fit: 'cover', cornerRadius: 0.03, allowsRotation: false },
  ],
} as const;

export const builtInTemplateCatalog: readonly TemplateDefinition[] = validateTemplateCatalog([...catalogSource, premiumSplitVersion2]);

export const defaultTemplateRef = {
  templateId: 'premium-split',
  templateVersion: 1,
} as const;

export function resolveBuiltInTemplate(templateId: string, templateVersion: number): TemplateDefinition | null {
  return builtInTemplateCatalog.find((template) => template.id === templateId && template.version === templateVersion) ?? null;
}

export function requireBuiltInTemplate(templateId: string, templateVersion: number): TemplateDefinition {
  const template = resolveBuiltInTemplate(templateId, templateVersion);
  if (template === null) throw new Error(`Unknown built-in template identity: ${templateId}@${templateVersion}.`);
  return template;
}

export function templateSupportsStyle(template: TemplateDefinition, style: TemplateStyleToken): boolean {
  return template.allowedStyleTokens.includes(style);
}
