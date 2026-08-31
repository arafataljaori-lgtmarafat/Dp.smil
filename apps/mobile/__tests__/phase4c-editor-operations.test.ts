import { builtInTemplateCatalog, requireBuiltInTemplate, resolveTemplateForDocument } from '@dentpilot/application';
import { creationDocumentSchema, type CreationDocument } from '@dentpilot/contracts';

import { applySlotPan, applySlotPinch, applySlotRotation, resetSlotTransform, selectedSlotAllowsRotation, swapBeforeAfter, switchTemplate, updateEditableText, updateTemplateTheme } from '../src/creation/editor-operations';

const document: CreationDocument = {
  schemaVersion: 1,
  templateRef: { templateId: 'story-before-after', templateVersion: 1 },
  canvas: { aspectRatioKey: 'story_9_16' },
  slotState: {
    before: { panX: 0, panY: 0, scale: 1, rotation: 0 },
    after: { panX: 0, panY: 0, scale: 1, rotation: 0 },
  },
  editableTextState: { beforeLabel: 'Before', afterLabel: 'After', title: 'Result' },
  styleState: { theme: 'clinical-neutral' },
};

describe('Phase 4C editor operations', () => {
  it('applies pan/pinch/rotation through the shared bounded transform rules', () => {
    const panned = applySlotPan({ document, bindingKey: 'before', deltaX: 10_000, deltaY: -10_000, slotWidth: 200, slotHeight: 200 });
    expect(panned.slotState.before).toMatchObject({ panX: 1, panY: -1 });
    const pinched = applySlotPinch(panned, 'before', 99);
    expect(pinched.slotState.before?.scale).toBe(3);
    const rotated = applySlotRotation(pinched, 'before', 999);
    expect(rotated.slotState.before?.rotation).toBe(180);
    expect(selectedSlotAllowsRotation(rotated, 'before')).toBe(true);
  });

  it('resets a selected slot deterministically and keeps rotation unavailable for a restrictive template', () => {
    const changed = applySlotPinch(document, 'before', 2);
    expect(resetSlotTransform(changed, 'before').slotState.before).toEqual({ panX: 0, panY: 0, scale: 1, rotation: 0 });
    const clinical = switchTemplate(document, requireBuiltInTemplate('clinical-stacked', 1));
    expect(selectedSlotAllowsRotation(clinical, 'before')).toBe(false);
    expect(applySlotRotation(clinical, 'before', 30).slotState.before?.rotation).toBe(0);
  });

  it('swaps only logical before/after bindings and their transforms without duplicating source media', () => {
    const source = { ...document, slotState: { before: { panX: 0.2, panY: 0, scale: 1.1, rotation: 10 }, after: { panX: -0.2, panY: 0, scale: 1.2, rotation: -10 } } } as CreationDocument;
    const result = swapBeforeAfter({ document: source, bindings: [{ bindingKey: 'before', mediaId: 'before-media' }, { bindingKey: 'after', mediaId: 'after-media' }] });
    expect(result.bindings).toEqual([{ bindingKey: 'before', mediaId: 'after-media' }, { bindingKey: 'after', mediaId: 'before-media' }]);
    expect(result.document.slotState.before).toEqual(source.slotState.after);
    expect(result.document.slotState.after).toEqual(source.slotState.before);
  });

  it('changes template identity explicitly while preserving bounded compatible transform state', () => {
    const updated = switchTemplate(document, requireBuiltInTemplate('premium-split', 2));
    expect(updated.templateRef).toEqual({ templateId: 'premium-split', templateVersion: 2 });
    expect(updated.canvas).toEqual({ aspectRatioKey: 'portrait_4_5' });
    expect(updated.slotState.before).toMatchObject({ scale: 1 });
    expect(updated.slotState.after).toMatchObject({ scale: 1 });
  });

  it('normalizes every practical catalog transition to a valid target document and deterministic allowed theme', () => {
    for (const from of builtInTemplateCatalog) {
      const source = switchTemplate({ ...document, styleState: { theme: 'clinical-warm' } }, from);
      for (const to of builtInTemplateCatalog) {
        const transitioned = switchTemplate(source, to);
        expect(() => creationDocumentSchema.parse(transitioned)).not.toThrow();
        expect(() => resolveTemplateForDocument(transitioned)).not.toThrow();
        expect(to.allowedStyleTokens).toContain(transitioned.styleState.theme);
        expect(Object.keys(transitioned.slotState).sort()).toEqual(to.slots.map((slot) => slot.bindingKey).sort());
      }
    }
  });

  it('normalizes forbidden markup and length before local commit and rejects a template-disallowed theme', () => {
    const short = switchTemplate(document, requireBuiltInTemplate('minimal-clinical', 1));
    const updated = updateEditableText(short, 'beforeLabel', `<${'a'.repeat(100)}>`);
    expect(updated.editableTextState.beforeLabel).toHaveLength(80);
    expect(updated.editableTextState.beforeLabel).not.toMatch(/[<>]/);
    expect(() => updateTemplateTheme(short, 'clinical-warm')).toThrow(/does not allow/i);
  });
});
