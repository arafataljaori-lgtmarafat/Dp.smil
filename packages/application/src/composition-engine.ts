import {
  creationDocumentSchema,
  type CreationBindingKey,
  type CreationDocument,
  type NormalizedRect,
  type TemplateDefinition,
  type TemplateStyleToken,
  type TemplateLayer,
  type TemplateSlot,
} from '@dentpilot/contracts';

import { requireBuiltInTemplate, templateSupportsStyle } from './template-catalog.js';

export type RenderTarget = {
  readonly width: number;
  readonly height: number;
};

export type CreationRenderAsset = {
  readonly bindingKey: CreationBindingKey;
  readonly mediaId: string;
  readonly width: number;
  readonly height: number;
  /** A private local native URI or authenticated renderer handle, never a public storage URL. */
  readonly source: string;
};

export type PixelRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type RenderTransform = {
  readonly scale: number;
  readonly rotationDegrees: number;
  readonly translateX: number;
  readonly translateY: number;
};

export type RenderCommand =
  | { readonly type: 'background'; readonly id: string; readonly zIndex: number; readonly colorToken: string }
  | { readonly type: 'image'; readonly id: string; readonly zIndex: number; readonly bindingKey: CreationBindingKey; readonly mediaId: string; readonly source: string; readonly destination: PixelRect; readonly clip: PixelRect; readonly cornerRadius: number; readonly transform: RenderTransform; readonly fit: 'cover' | 'contain' }
  | { readonly type: 'shape'; readonly id: string; readonly zIndex: number; readonly rect: PixelRect; readonly fillToken: string; readonly cornerRadius: number }
  | { readonly type: 'divider'; readonly id: string; readonly zIndex: number; readonly start: { readonly x: number; readonly y: number }; readonly end: { readonly x: number; readonly y: number }; readonly colorToken: string; readonly width: number }
  | { readonly type: 'text'; readonly id: string; readonly zIndex: number; readonly text: string; readonly rect: PixelRect; readonly colorToken: string; readonly fontSize: number; readonly align: 'left' | 'center' | 'right' };

export type RenderPlan = {
  readonly template: { readonly id: string; readonly version: number; readonly aspectRatio: TemplateDefinition['aspectRatio'] };
  readonly canvas: RenderTarget;
  readonly styleToken: TemplateStyleToken;
  readonly commands: readonly RenderCommand[];
};

const aspectRatioValues = {
  square: 1,
  portrait_4_5: 4 / 5,
  story_9_16: 9 / 16,
  landscape_16_9: 16 / 9,
} as const;

export function aspectRatioValue(key: TemplateDefinition['aspectRatio']): number {
  return aspectRatioValues[key];
}

function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive finite number.`);
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) throw new Error('Geometry values must be finite.');
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizedRectToPixels(rect: NormalizedRect, target: RenderTarget): PixelRect {
  assertPositiveFinite('Render target width', target.width);
  assertPositiveFinite('Render target height', target.height);
  return {
    x: rect.x * target.width,
    y: rect.y * target.height,
    width: rect.width * target.width,
    height: rect.height * target.height,
  };
}

export function resolveRenderCanvas(aspectRatio: TemplateDefinition['aspectRatio'], surface: RenderTarget): RenderTarget {
  assertPositiveFinite('Render surface width', surface.width);
  assertPositiveFinite('Render surface height', surface.height);
  const ratio = aspectRatioValue(aspectRatio);
  const surfaceRatio = surface.width / surface.height;
  if (surfaceRatio > ratio) return { width: surface.height * ratio, height: surface.height };
  return { width: surface.width, height: surface.width / ratio };
}

export function normalizeSlotTransform(input: {
  readonly transform: { readonly panX: number; readonly panY: number; readonly scale: number; readonly rotation: number };
  readonly slot: Pick<TemplateSlot, 'fit' | 'allowsRotation'>;
}): { readonly panX: number; readonly panY: number; readonly scale: number; readonly rotation: number } {
  const minimumScale = input.slot.fit === 'cover' ? 1 : 0.25;
  return {
    panX: clamp(input.transform.panX, -1, 1),
    panY: clamp(input.transform.panY, -1, 1),
    scale: clamp(input.transform.scale, minimumScale, 3),
    rotation: input.slot.allowsRotation ? clamp(input.transform.rotation, -180, 180) : 0,
  };
}

export function resolveImagePlacement(input: {
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly slot: PixelRect;
  readonly fit: 'cover' | 'contain';
  readonly transform: { readonly panX: number; readonly panY: number; readonly scale: number; readonly rotation: number };
  readonly allowsRotation: boolean;
}): { readonly destination: PixelRect; readonly transform: RenderTransform } {
  assertPositiveFinite('Source width', input.sourceWidth);
  assertPositiveFinite('Source height', input.sourceHeight);
  assertPositiveFinite('Slot width', input.slot.width);
  assertPositiveFinite('Slot height', input.slot.height);
  const normalizedTransform = normalizeSlotTransform({
    transform: input.transform,
    slot: { fit: input.fit, allowsRotation: input.allowsRotation },
  });
  const panX = normalizedTransform.panX;
  const panY = normalizedTransform.panY;
  const rotationDegrees = normalizedTransform.rotation;
  const radians = Math.abs(rotationDegrees) * Math.PI / 180;
  const baseScale = input.fit === 'cover'
    ? Math.max(input.slot.width / input.sourceWidth, input.slot.height / input.sourceHeight)
    : Math.min(input.slot.width / input.sourceWidth, input.slot.height / input.sourceHeight);
  const requestedZoom = normalizedTransform.scale;
  const baseWidth = input.sourceWidth * baseScale;
  const baseHeight = input.sourceHeight * baseScale;
  const rotationCoverZoom = input.fit === 'cover'
    ? Math.max(
      (Math.abs(Math.cos(radians)) * input.slot.width + Math.abs(Math.sin(radians)) * input.slot.height) / baseWidth,
      (Math.abs(Math.sin(radians)) * input.slot.width + Math.abs(Math.cos(radians)) * input.slot.height) / baseHeight,
    )
    : 0;
  const zoom = Math.max(requestedZoom, rotationCoverZoom);
  const width = baseWidth * zoom;
  const height = baseHeight * zoom;
  const rotatedWidth = Math.abs(Math.cos(radians)) * width + Math.abs(Math.sin(radians)) * height;
  const rotatedHeight = Math.abs(Math.sin(radians)) * width + Math.abs(Math.cos(radians)) * height;
  const translateX = panX * Math.max(0, (rotatedWidth - input.slot.width) / 2);
  const translateY = panY * Math.max(0, (rotatedHeight - input.slot.height) / 2);
  return {
    destination: {
      x: input.slot.x + (input.slot.width - width) / 2 + translateX,
      y: input.slot.y + (input.slot.height - height) / 2 + translateY,
      width,
      height,
    },
    transform: { scale: baseScale * zoom, rotationDegrees, translateX, translateY },
  };
}

function textForDocument(document: CreationDocument, textKey: 'beforeLabel' | 'afterLabel' | 'title' | 'subtitle'): string | null {
  const value = document.editableTextState[textKey];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function commandForLayer(layer: TemplateLayer, template: TemplateDefinition, document: CreationDocument, assets: ReadonlyMap<CreationBindingKey, CreationRenderAsset>, canvas: RenderTarget): RenderCommand | null {
  switch (layer.type) {
    case 'background':
      return { type: 'background', id: layer.id, zIndex: layer.zIndex, colorToken: layer.colorToken };
    case 'shape': {
      const rect = normalizedRectToPixels(layer.rect, canvas);
      return { type: 'shape', id: layer.id, zIndex: layer.zIndex, rect, fillToken: layer.fillToken, cornerRadius: layer.cornerRadius * Math.min(canvas.width, canvas.height) };
    }
    case 'divider':
      return {
        type: 'divider', id: layer.id, zIndex: layer.zIndex,
        start: { x: layer.start.x * canvas.width, y: layer.start.y * canvas.height },
        end: { x: layer.end.x * canvas.width, y: layer.end.y * canvas.height },
        colorToken: layer.colorToken,
        width: layer.width * Math.min(canvas.width, canvas.height),
      };
    case 'text': {
      const text = textForDocument(document, layer.textKey);
      if (text === null || !layer.visibleByDefault) return null;
      return {
        type: 'text', id: layer.id, zIndex: layer.zIndex, text,
        rect: normalizedRectToPixels(layer.rect, canvas), colorToken: layer.colorToken,
        fontSize: layer.fontScale * Math.min(canvas.width, canvas.height), align: layer.align,
      };
    }
    case 'imageSlot': {
      const slot = template.slots.find((candidate) => candidate.id === layer.slotId);
      if (slot === undefined) throw new Error(`Template ${template.id}@${template.version} has an unresolved slot layer: ${layer.slotId}.`);
      const asset = assets.get(slot.bindingKey);
      const transform = document.slotState[slot.bindingKey];
      if (asset === undefined || transform === undefined) throw new Error(`Creation document is incompatible with ${template.id}@${template.version}: missing ${slot.bindingKey} asset state.`);
      const clip = normalizedRectToPixels(slot.rect, canvas);
      const placement = resolveImagePlacement({
        sourceWidth: asset.width,
        sourceHeight: asset.height,
        slot: clip,
        fit: slot.fit,
        transform,
        allowsRotation: slot.allowsRotation,
      });
      return {
        type: 'image', id: layer.id, zIndex: layer.zIndex, bindingKey: slot.bindingKey, mediaId: asset.mediaId,
        source: asset.source, destination: placement.destination, clip,
        cornerRadius: slot.cornerRadius * Math.min(canvas.width, canvas.height), transform: placement.transform, fit: slot.fit,
      };
    }
  }
}

export function resolveTemplateForDocument(documentInput: CreationDocument): TemplateDefinition {
  const document = creationDocumentSchema.parse(documentInput);
  if (document.templateRef === null) throw new Error('Creation document does not select a template.');
  const template = requireBuiltInTemplate(document.templateRef.templateId, document.templateRef.templateVersion);
  if (document.canvas.aspectRatioKey !== template.aspectRatio) {
    throw new Error(`Creation document aspect ratio does not match ${template.id}@${template.version}.`);
  }
  if (!templateSupportsStyle(template, document.styleState.theme)) {
    throw new Error(`Creation document style is not allowed by ${template.id}@${template.version}.`);
  }
  return template;
}

export function createRenderPlan(input: {
  readonly template: TemplateDefinition;
  readonly document: CreationDocument;
  readonly bindings: readonly CreationRenderAsset[];
  readonly target: RenderTarget;
}): RenderPlan {
  const document = creationDocumentSchema.parse(input.document);
  if (document.templateRef === null || document.templateRef.templateId !== input.template.id || document.templateRef.templateVersion !== input.template.version) {
    throw new Error('Render plan template must match the exact CreationDocument template reference.');
  }
  if (document.canvas.aspectRatioKey !== input.template.aspectRatio) throw new Error('Render plan template aspect ratio does not match the document.');
  if (!templateSupportsStyle(input.template, document.styleState.theme)) throw new Error('Render plan style is not allowed by the template.');
  const assets = new Map<CreationBindingKey, CreationRenderAsset>();
  for (const binding of input.bindings) {
    if (assets.has(binding.bindingKey)) throw new Error(`Duplicate render asset binding: ${binding.bindingKey}.`);
    if (!Number.isFinite(binding.width) || binding.width <= 0 || !Number.isFinite(binding.height) || binding.height <= 0) throw new Error(`Render asset dimensions are invalid for ${binding.bindingKey}.`);
    if (!binding.source.startsWith('file://') && !binding.source.startsWith('dentpilot-private://')) throw new Error('Render assets must use a private local URI or authenticated renderer handle.');
    assets.set(binding.bindingKey, binding);
  }
  const expectedBindingKeys = new Set(input.template.slots.map((slot) => slot.bindingKey));
  for (const key of expectedBindingKeys) {
    if (!assets.has(key) || document.slotState[key] === undefined) throw new Error(`Render plan lacks the required ${key} document state or media binding.`);
  }
  const canvas = resolveRenderCanvas(input.template.aspectRatio, input.target);
  const commands = input.template.layers
    .slice()
    .sort((left, right) => left.zIndex - right.zIndex)
    .map((layer) => commandForLayer(layer, input.template, document, assets, canvas))
    .filter((command): command is RenderCommand => command !== null);
  return {
    template: { id: input.template.id, version: input.template.version, aspectRatio: input.template.aspectRatio },
    canvas,
    styleToken: document.styleState.theme,
    commands,
  };
}

export function createRenderPlanForDocument(input: {
  readonly document: CreationDocument;
  readonly bindings: readonly CreationRenderAsset[];
  readonly target: RenderTarget;
}): RenderPlan {
  return createRenderPlan({ ...input, template: resolveTemplateForDocument(input.document) });
}
