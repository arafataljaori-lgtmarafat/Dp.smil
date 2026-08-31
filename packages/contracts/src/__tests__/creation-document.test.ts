import { describe, expect, it } from 'vitest';

import {
  assertCreationDocumentSize,
  canonicalizeCreationDocument,
  creationDocumentV1Schema,
  replaceCreationBindingsRequestSchema,
  type CreationDocumentV1,
} from '../index.js';

const document: CreationDocumentV1 = {
  schemaVersion: 1,
  templateRef: null,
  canvas: { aspectRatioKey: 'portrait_4_5' },
  slotState: {
    before: { panX: 0, panY: 0, scale: 1, rotation: 0 },
  },
  editableTextState: { beforeLabel: 'Before', afterLabel: 'After' },
  styleState: { theme: 'clinical-neutral' },
};

describe('CreationDocument v1 contract', () => {
  it('accepts the explicit unconfigured-template document and normalized logical transforms', () => {
    expect(creationDocumentV1Schema.parse(document)).toEqual(document);
  });

  it.each([
    [{ ...document, storageKey: 'private/key' }],
    [{ ...document, editableTextState: { ...document.editableTextState, beforeLabel: '<script>' } }],
    [{ ...document, slotState: { before: { panX: 1.1, panY: 0, scale: 1, rotation: 0 } } }],
    [{ ...document, slotState: { before: { panX: 0, panY: 0, scale: 0, rotation: 0 } } }],
    [{ ...document, slotState: { before: { panX: 0, panY: 0, scale: 1, rotation: 181 } } }],
    [{ ...document, templateRef: { templateId: 'template', templateVersion: 0 } }],
  ])('rejects forbidden or invalid structured document values', (invalid) => {
    expect(() => creationDocumentV1Schema.parse(invalid)).toThrow();
  });

  it('produces identical canonical JSON despite different object-key insertion order', () => {
    const reordered = {
      styleState: { theme: 'clinical-neutral' },
      editableTextState: { afterLabel: 'After', beforeLabel: 'Before' },
      slotState: { before: { rotation: 0, scale: 1, panY: 0, panX: 0 } },
      canvas: { aspectRatioKey: 'portrait_4_5' },
      templateRef: null,
      schemaVersion: 1,
    } as CreationDocumentV1;
    expect(canonicalizeCreationDocument(document)).toBe(canonicalizeCreationDocument(reordered));
  });

  it('enforces a supplied finite serialized-size limit', () => {
    expect(() => assertCreationDocumentSize(document, 1)).toThrow('exceeds');
    expect(() => assertCreationDocumentSize(document, 16_384)).not.toThrow();
  });

  it('requires expectedRevision for a complete binding-set replacement and rejects client ownership fields', () => {
    const bindings = [{ bindingKey: 'before' as const, mediaId: '11111111-1111-4111-8111-111111111111' }];
    expect(replaceCreationBindingsRequestSchema.parse({ expectedRevision: 7, bindings })).toEqual({ expectedRevision: 7, bindings });
    expect(() => replaceCreationBindingsRequestSchema.parse({ bindings })).toThrow();
    expect(() => replaceCreationBindingsRequestSchema.parse({ expectedRevision: 7, bindings, ownerUserId: 'forged' })).toThrow();
  });
});
