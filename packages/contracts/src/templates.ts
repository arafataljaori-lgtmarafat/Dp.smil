import { z } from 'zod';

export const templateAspectRatioKeys = ['square', 'portrait_4_5', 'story_9_16', 'landscape_16_9'] as const;
export type TemplateAspectRatioKey = (typeof templateAspectRatioKeys)[number];
export const templateStyleTokens = ['clinical-neutral', 'clinical-blue', 'clinical-warm'] as const;
export type TemplateStyleToken = (typeof templateStyleTokens)[number];
export const editableTemplateTextKeys = ['beforeLabel', 'afterLabel', 'title', 'subtitle'] as const;
export type EditableTemplateTextKey = (typeof editableTemplateTextKeys)[number];
export const templateLayerTypes = ['background', 'imageSlot', 'shape', 'divider', 'text'] as const;
const templateBindingKeySchema = z.enum(['before', 'after']);

const normalizedScalar = z.number().finite().min(0).max(1);
export const normalizedRectSchema = z.object({
  x: normalizedScalar,
  y: normalizedScalar,
  width: z.number().finite().positive().max(1),
  height: z.number().finite().positive().max(1),
}).strict().superRefine((value, context) => {
  if (value.x + value.width > 1 || value.y + value.height > 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Normalized rectangle must remain inside the logical canvas.' });
  }
});
export type NormalizedRect = z.infer<typeof normalizedRectSchema>;

const colorTokenSchema = z.enum(['canvas', 'surface', 'ink', 'muted', 'accent', 'accentSoft', 'white']);
const zIndexSchema = z.number().int().min(0).max(100);
const layerBase = {
  id: z.string().trim().min(1).max(80),
  zIndex: zIndexSchema,
};

export const templateSlotSchema = z.object({
  id: z.string().trim().min(1).max(80),
  bindingKey: templateBindingKeySchema,
  rect: normalizedRectSchema,
  fit: z.enum(['cover', 'contain']),
  cornerRadius: z.number().finite().min(0).max(0.1),
  allowsRotation: z.boolean(),
}).strict();
export type TemplateSlot = z.infer<typeof templateSlotSchema>;

const templateBackgroundLayerSchema = z.object({
  ...layerBase,
  type: z.literal('background'),
  colorToken: colorTokenSchema,
}).strict();
const templateImageSlotLayerSchema = z.object({
  ...layerBase,
  type: z.literal('imageSlot'),
  slotId: z.string().trim().min(1).max(80),
}).strict();
const templateShapeLayerSchema = z.object({
  ...layerBase,
  type: z.literal('shape'),
  rect: normalizedRectSchema,
  fillToken: colorTokenSchema,
  cornerRadius: z.number().finite().min(0).max(0.1),
}).strict();
const templateDividerLayerSchema = z.object({
  ...layerBase,
  type: z.literal('divider'),
  start: z.object({ x: normalizedScalar, y: normalizedScalar }).strict(),
  end: z.object({ x: normalizedScalar, y: normalizedScalar }).strict(),
  colorToken: colorTokenSchema,
  width: z.number().finite().positive().max(0.05),
}).strict();
const templateTextLayerSchema = z.object({
  ...layerBase,
  type: z.literal('text'),
  textKey: z.enum(editableTemplateTextKeys),
  rect: normalizedRectSchema,
  colorToken: colorTokenSchema,
  fontScale: z.number().finite().min(0.02).max(0.18),
  align: z.enum(['left', 'center', 'right']),
  visibleByDefault: z.boolean(),
}).strict();

export const templateLayerSchema = z.discriminatedUnion('type', [
  templateBackgroundLayerSchema,
  templateImageSlotLayerSchema,
  templateShapeLayerSchema,
  templateDividerLayerSchema,
  templateTextLayerSchema,
]);
export type TemplateLayer = z.infer<typeof templateLayerSchema>;

export const templateDefinitionSchema = z.object({
  id: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/),
  version: z.number().int().positive(),
  displayName: z.string().trim().min(2).max(80),
  category: z.literal('before_after'),
  aspectRatio: z.enum(templateAspectRatioKeys),
  background: z.object({ colorToken: colorTokenSchema }).strict(),
  slots: z.array(templateSlotSchema).min(1).max(2),
  layers: z.array(templateLayerSchema).min(3).max(16),
  editableLabels: z.array(z.enum(editableTemplateTextKeys)).min(2).max(4),
  allowedStyleTokens: z.array(z.enum(templateStyleTokens)).min(1).max(templateStyleTokens.length),
}).strict();
export type TemplateDefinition = z.infer<typeof templateDefinitionSchema>;

export type TemplateValidationIssue = {
  readonly template: string;
  readonly message: string;
};

const unique = (values: readonly string[]) => new Set(values).size === values.length;

export function validateTemplateDefinition(input: unknown): TemplateDefinition {
  const template = templateDefinitionSchema.parse(input);
  const issue = (message: string): never => { throw new Error(`Template ${template.id}@${template.version}: ${message}`); };
  if (!unique(template.slots.map((slot) => slot.id))) issue('slot IDs must be unique.');
  if (!unique(template.slots.map((slot) => slot.bindingKey))) issue('slot binding keys must be unique.');
  if (!unique(template.layers.map((layer) => layer.id))) issue('layer IDs must be unique.');
  if (!unique(template.layers.map((layer) => String(layer.zIndex)))) issue('layer z-order must be unique and deterministic.');
  if (!unique(template.editableLabels)) issue('editable labels must be unique.');
  if (!unique(template.allowedStyleTokens)) issue('allowed style tokens must be unique.');
  const slotIds = new Set(template.slots.map((slot) => slot.id));
  const imageSlots = template.layers.filter((layer): layer is Extract<TemplateLayer, { type: 'imageSlot' }> => layer.type === 'imageSlot');
  if (imageSlots.length !== template.slots.length) issue('each slot must have exactly one imageSlot layer.');
  if (!imageSlots.every((layer) => slotIds.has(layer.slotId))) issue('every imageSlot layer must reference a declared slot.');
  if (!unique(imageSlots.map((layer) => layer.slotId))) issue('each declared slot must have one imageSlot layer.');
  const textLayers = template.layers.filter((layer): layer is Extract<TemplateLayer, { type: 'text' }> => layer.type === 'text');
  const textKeys = new Set(textLayers.map((layer) => layer.textKey));
  if (!template.editableLabels.every((key) => textKeys.has(key))) issue('every editable label must have one declared text layer.');
  if (!template.allowedStyleTokens.includes('clinical-neutral')) issue('clinical-neutral must remain a supported safe fallback style.');
  return template;
}

export function validateTemplateCatalog(input: readonly unknown[]): readonly TemplateDefinition[] {
  const catalog = input.map(validateTemplateDefinition);
  const identities = catalog.map((template) => `${template.id}@${template.version}`);
  if (!unique(identities)) throw new Error('Template catalog contains duplicate template identities.');
  return catalog;
}
