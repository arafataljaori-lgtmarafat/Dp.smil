import { describe, expect, it } from 'vitest';

import { validateTemplateDefinition } from '@dentpilot/contracts';

import {
  aspectRatioValue,
  builtInTemplateCatalog,
  createRenderPlan,
  createRenderPlanForDocument,
  requireBuiltInTemplate,
  resolveImagePlacement,
  resolveRenderCanvas,
  resolveTemplateForDocument,
} from '../index.js';

const privateAssets = [
  { bindingKey: 'before' as const, mediaId: 'before-id', width: 1600, height: 1200, source: 'dentpilot-private://before' },
  { bindingKey: 'after' as const, mediaId: 'after-id', width: 1200, height: 1600, source: 'dentpilot-private://after' },
];

function premiumDocument(version = 1) {
  return {
    schemaVersion: 1 as const,
    templateRef: { templateId: 'premium-split', templateVersion: version },
    canvas: { aspectRatioKey: 'portrait_4_5' as const },
    slotState: {
      before: { panX: 0.25, panY: -0.25, scale: 1, rotation: 0 },
      after: { panX: 0, panY: 0, scale: 1.2, rotation: 0 },
    },
    editableTextState: { beforeLabel: 'Before', afterLabel: 'After', title: 'Case comparison' },
    styleState: { theme: 'clinical-neutral' as const },
  };
}

describe('Phase 4B built-in template catalog', () => {
  it('validates every code-only template and ships the six required families', () => {
    expect(builtInTemplateCatalog).toHaveLength(7);
    expect(new Set(builtInTemplateCatalog.map((template) => template.id))).toEqual(new Set([
      'clean-side-by-side', 'premium-split', 'clinical-stacked', 'story-before-after', 'minimal-clinical', 'presentation-comparison',
    ]));
    for (const template of builtInTemplateCatalog) {
      expect(validateTemplateDefinition(template)).toEqual(template);
      expect(template.layers.map((layer) => layer.zIndex)).toEqual([...template.layers.map((layer) => layer.zIndex)].sort((a, b) => a - b));
    }
  });

  it('rejects a malformed template before use', () => {
    const invalid = structuredClone(requireBuiltInTemplate('clean-side-by-side', 1)) as { layers: Array<{ id: string }> };
    invalid.layers[1]!.id = 'background';
    expect(() => validateTemplateDefinition(invalid)).toThrow('layer IDs must be unique');
  });

  it('resolves exact historical identities and never silently substitutes a later version', () => {
    const v1 = requireBuiltInTemplate('premium-split', 1);
    const v2 = requireBuiltInTemplate('premium-split', 2);
    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect(v1.slots).not.toEqual(v2.slots);
    expect(() => requireBuiltInTemplate('premium-split', 3)).toThrow('Unknown built-in template identity');
  });
});

describe('Phase 4B deterministic composition engine', () => {
  it('maps the logical aspect-ratio canvas consistently onto any render surface', () => {
    expect(aspectRatioValue('portrait_4_5')).toBe(0.8);
    expect(resolveRenderCanvas('portrait_4_5', { width: 400, height: 800 })).toEqual({ width: 400, height: 500 });
    expect(resolveRenderCanvas('landscape_16_9', { width: 1200, height: 500 })).toEqual({ width: 888.8888888888888, height: 500 });
  });

  it('uses cover geometry with bounded pan, zoom, and permitted rotation without exposing empty slot coverage', () => {
    const slot = { x: 0, y: 0, width: 300, height: 200 };
    const result = resolveImagePlacement({
      sourceWidth: 800,
      sourceHeight: 400,
      slot,
      fit: 'cover',
      transform: { panX: 99, panY: -99, scale: 0.01, rotation: 45 },
      allowsRotation: true,
    });
    expect(result.destination.width).toBeGreaterThanOrEqual(slot.width);
    expect(result.destination.height).toBeGreaterThanOrEqual(slot.height);
    expect(result.transform.translateX).toBeGreaterThanOrEqual(0);
    expect(result.transform.translateY).toBeLessThanOrEqual(0);
    expect(result.transform.rotationDegrees).toBe(45);
    expect(result.transform.scale).toBeGreaterThan(0);
  });

  it('uses contain geometry only when the template explicitly permits it and clamps rotation when disabled', () => {
    const contained = resolveImagePlacement({
      sourceWidth: 1600,
      sourceHeight: 400,
      slot: { x: 0, y: 0, width: 300, height: 300 },
      fit: 'contain',
      transform: { panX: 0, panY: 0, scale: 1, rotation: 180 },
      allowsRotation: false,
    });
    expect(contained.destination.width).toBe(300);
    expect(contained.destination.height).toBe(75);
    expect(contained.transform.rotationDegrees).toBe(0);
    expect(() => resolveImagePlacement({
      sourceWidth: Number.NaN, sourceHeight: 1, slot: { x: 0, y: 0, width: 1, height: 1 }, fit: 'cover',
      transform: { panX: 0, panY: 0, scale: 1, rotation: 0 }, allowsRotation: false,
    })).toThrow('Source width');
  });

  it('returns the same platform-neutral plan for the same valid input and deterministic z-order', () => {
    const template = requireBuiltInTemplate('premium-split', 1);
    const input = { template, document: premiumDocument(), bindings: privateAssets, target: { width: 1080, height: 1920 } };
    const first = createRenderPlan(input);
    const second = createRenderPlan(input);
    expect(first).toEqual(second);
    expect(first.commands.map((command) => command.zIndex)).toEqual([...first.commands.map((command) => command.zIndex)].sort((a, b) => a - b));
    expect(first.commands.filter((command) => command.type === 'image')).toHaveLength(2);
    expect(first.commands.some((command) => command.type === 'image' && command.bindingKey === 'before' && command.source === 'dentpilot-private://before')).toBe(true);
  });

  it('fails explicitly for template identity, ratio, style, or binding incompatibility', () => {
    expect(() => resolveTemplateForDocument({ ...premiumDocument(), templateRef: { templateId: 'premium-split', templateVersion: 99 } })).toThrow('Unknown built-in template identity');
    expect(() => createRenderPlan({ template: requireBuiltInTemplate('premium-split', 1), document: { ...premiumDocument(), canvas: { aspectRatioKey: 'square' } }, bindings: privateAssets, target: { width: 100, height: 100 } })).toThrow('aspect ratio');
    expect(() => createRenderPlan({ template: requireBuiltInTemplate('premium-split', 1), document: { ...premiumDocument(), styleState: { theme: 'clinical-warm' } }, bindings: privateAssets, target: { width: 100, height: 100 } })).toThrow('style');
    expect(() => createRenderPlanForDocument({ document: premiumDocument(), bindings: [privateAssets[0]!], target: { width: 100, height: 100 } })).toThrow('after');
  });

  it('reproduces a historical versioned revision plan even when a newer template version exists', () => {
    const historical = createRenderPlanForDocument({ document: premiumDocument(1), bindings: privateAssets, target: { width: 800, height: 1000 } });
    const current = createRenderPlanForDocument({ document: premiumDocument(2), bindings: privateAssets, target: { width: 800, height: 1000 } });
    expect(historical.template).toEqual({ id: 'premium-split', version: 1, aspectRatio: 'portrait_4_5' });
    expect(current.template).toEqual({ id: 'premium-split', version: 2, aspectRatio: 'portrait_4_5' });
    const historicalBefore = historical.commands.find((command) => command.type === 'image' && command.bindingKey === 'before');
    const currentBefore = current.commands.find((command) => command.type === 'image' && command.bindingKey === 'before');
    expect(historicalBefore).not.toEqual(currentBefore);
  });
});
