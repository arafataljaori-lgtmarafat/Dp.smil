import {
  normalizeSlotTransform,
  requireBuiltInTemplate,
  resolveTemplateForDocument,
} from '@dentpilot/application';
import { creationDocumentSchema, type CreationBindingKey, type CreationDocument, type EditableTemplateTextKey, type TemplateDefinition, type TemplateStyleToken } from '@dentpilot/contracts';

export type EditorBinding = { readonly bindingKey: CreationBindingKey; readonly mediaId: string };

function cloneDocument(document: CreationDocument, slotState: CreationDocument['slotState']): CreationDocument {
  return { ...document, slotState };
}

function slotFor(document: CreationDocument, bindingKey: CreationBindingKey) {
  return resolveTemplateForDocument(document).slots.find((slot) => slot.bindingKey === bindingKey);
}

function requireSlot(document: CreationDocument, bindingKey: CreationBindingKey) {
  const slot = slotFor(document, bindingKey);
  if (slot === undefined) throw new Error(`The selected template does not expose ${bindingKey}.`);
  const transform = document.slotState[bindingKey];
  if (transform === undefined) throw new Error(`The creation document is missing ${bindingKey} transform state.`);
  return { slot, transform };
}

export function resetSlotTransform(document: CreationDocument, bindingKey: CreationBindingKey): CreationDocument {
  const { slot } = requireSlot(document, bindingKey);
  return cloneDocument(document, {
    ...document.slotState,
    [bindingKey]: normalizeSlotTransform({ transform: { panX: 0, panY: 0, scale: 1, rotation: 0 }, slot }),
  });
}

export function applySlotPan(input: {
  readonly document: CreationDocument;
  readonly bindingKey: CreationBindingKey;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly slotWidth: number;
  readonly slotHeight: number;
}): CreationDocument {
  if (!Number.isFinite(input.deltaX) || !Number.isFinite(input.deltaY) || !Number.isFinite(input.slotWidth) || !Number.isFinite(input.slotHeight) || input.slotWidth <= 0 || input.slotHeight <= 0) {
    throw new Error('Pan gesture geometry must be finite and positive.');
  }
  const { slot, transform } = requireSlot(input.document, input.bindingKey);
  const next = normalizeSlotTransform({
    transform: {
      ...transform,
      panX: transform.panX + input.deltaX / (input.slotWidth / 2),
      panY: transform.panY + input.deltaY / (input.slotHeight / 2),
    },
    slot,
  });
  return cloneDocument(input.document, { ...input.document.slotState, [input.bindingKey]: next });
}

export function applySlotPinch(document: CreationDocument, bindingKey: CreationBindingKey, scaleFactor: number): CreationDocument {
  if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) throw new Error('Pinch scale factor must be a positive finite number.');
  const { slot, transform } = requireSlot(document, bindingKey);
  return cloneDocument(document, {
    ...document.slotState,
    [bindingKey]: normalizeSlotTransform({ transform: { ...transform, scale: transform.scale * scaleFactor }, slot }),
  });
}

export function applySlotRotation(document: CreationDocument, bindingKey: CreationBindingKey, rotationDelta: number): CreationDocument {
  if (!Number.isFinite(rotationDelta)) throw new Error('Rotation delta must be finite.');
  const { slot, transform } = requireSlot(document, bindingKey);
  return cloneDocument(document, {
    ...document.slotState,
    [bindingKey]: normalizeSlotTransform({ transform: { ...transform, rotation: transform.rotation + rotationDelta }, slot }),
  });
}

function editableTemplateFor(document: CreationDocument): TemplateDefinition {
  if (document.templateRef === null) throw new Error('Choose a template before editing template-bound text or styles.');
  return resolveTemplateForDocument(document);
}

/** Normalizes direct text input to the shared document constraints before it reaches local editor state. */
export function updateEditableText(document: CreationDocument, key: EditableTemplateTextKey, input: string): CreationDocument {
  const template = editableTemplateFor(document);
  if (!template.editableLabels.includes(key)) throw new Error(`The selected template does not expose ${key}.`);
  const text = input.replace(/[<>]/g, '').slice(0, 80);
  const editableTextState = { ...document.editableTextState };
  if (key === 'beforeLabel' || key === 'afterLabel') editableTextState[key] = text;
  else if (text.length === 0) delete editableTextState[key];
  else editableTextState[key] = text;
  return creationDocumentSchema.parse({ ...document, editableTextState });
}

/** Rejects unsupported styles at the active template boundary rather than allowing a render crash. */
export function updateTemplateTheme(document: CreationDocument, theme: TemplateStyleToken): CreationDocument {
  const template = editableTemplateFor(document);
  if (!template.allowedStyleTokens.includes(theme)) throw new Error(`The selected template does not allow ${theme}.`);
  return creationDocumentSchema.parse({ ...document, styleState: { ...document.styleState, theme } });
}

export function switchTemplate(document: CreationDocument, template: TemplateDefinition): CreationDocument {
  const theme = template.allowedStyleTokens.includes(document.styleState.theme)
    ? document.styleState.theme
    : template.allowedStyleTokens.find((token) => token === 'clinical-neutral') ?? template.allowedStyleTokens[0]!;
  const next: CreationDocument = {
    ...document,
    templateRef: { templateId: template.id, templateVersion: template.version },
    canvas: { aspectRatioKey: template.aspectRatio },
    styleState: { ...document.styleState, theme },
  };
  const slots = Object.fromEntries(template.slots.map((slot) => [
    slot.bindingKey,
    normalizeSlotTransform({ transform: next.slotState[slot.bindingKey] ?? { panX: 0, panY: 0, scale: 1, rotation: 0 }, slot }),
  ]));
  return { ...next, slotState: slots };
}

export function swapBeforeAfter(input: { readonly document: CreationDocument; readonly bindings: readonly EditorBinding[] }): { readonly document: CreationDocument; readonly bindings: readonly EditorBinding[] } {
  const before = input.bindings.find((binding) => binding.bindingKey === 'before');
  const after = input.bindings.find((binding) => binding.bindingKey === 'after');
  if (before === undefined || after === undefined) throw new Error('Both committed bindings are required to swap a comparison.');
  const template = resolveTemplateForDocument(input.document);
  if (!template.slots.some((slot) => slot.bindingKey === 'before') || !template.slots.some((slot) => slot.bindingKey === 'after')) {
    throw new Error('The selected template does not support a Before/After swap.');
  }
  const beforeTransform = input.document.slotState.before;
  const afterTransform = input.document.slotState.after;
  if (beforeTransform === undefined || afterTransform === undefined) throw new Error('Both transform states are required to swap a comparison.');
  return {
    document: { ...input.document, slotState: { ...input.document.slotState, before: afterTransform, after: beforeTransform } },
    bindings: input.bindings.map((binding) => binding.bindingKey === 'before'
      ? { bindingKey: 'before', mediaId: after.mediaId }
      : binding.bindingKey === 'after'
        ? { bindingKey: 'after', mediaId: before.mediaId }
        : binding),
  };
}

/** Returns whether the current exact template allows limited rotation for the selected binding. */
export function selectedSlotAllowsRotation(document: CreationDocument, bindingKey: CreationBindingKey): boolean {
  return requireSlot(document, bindingKey).slot.allowsRotation;
}

/** An explicit identity check used by editor adapters; no automatic fallback is allowed. */
export function selectedTemplateIdentity(document: CreationDocument): { readonly id: string; readonly version: number } {
  if (document.templateRef === null) throw new Error('Choose a template before editing.');
  const template = requireBuiltInTemplate(document.templateRef.templateId, document.templateRef.templateVersion);
  return { id: template.id, version: template.version };
}
