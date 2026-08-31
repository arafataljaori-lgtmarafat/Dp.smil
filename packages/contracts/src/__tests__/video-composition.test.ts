import { describe, expect, it } from 'vitest';

import {
  assertVideoCompositionDocumentSize,
  canonicalizeVideoCompositionDocument,
  videoCompositionDocumentV1Schema,
  type VideoCompositionDocumentV1,
} from '../index.js';

const document: VideoCompositionDocumentV1 = {
  schemaVersion: 1,
  templateRef: { templateId: 'classic-reveal', templateVersion: 1 },
  canvas: { aspectRatioKey: 'portrait_4_5' },
  durationMs: 4_000,
  assetBindings: {
    before: { mediaId: '11111111-1111-4111-8111-111111111111' },
    after: { mediaId: '22222222-2222-4222-8222-222222222222' },
  },
  editableTextState: { beforeLabel: 'Before', afterLabel: 'After' },
  styleState: { theme: 'clinical-neutral' },
  renderProfile: { profileKey: 'preview' },
  audioRef: null,
};

describe('VideoCompositionDocument v1 contract', () => {
  it('accepts a well-formed document', () => {
    expect(videoCompositionDocumentV1Schema.parse(document)).toEqual(document);
  });

  it('accepts an optional, well-formed audio reference', () => {
    const withAudio = { ...document, audioRef: { mediaId: '33333333-3333-4333-8333-333333333333', startMs: 0, volume: 0.8 } };
    expect(videoCompositionDocumentV1Schema.parse(withAudio)).toEqual(withAudio);
  });

  it.each([
    [{ ...document, unknownField: true }],
    [{ ...document, schemaVersion: 2 }],
    [{ ...document, durationMs: 0 }],
    [{ ...document, durationMs: 999 }],
    [{ ...document, durationMs: 60_001 }],
    [{ ...document, durationMs: 1.5 }],
    [{ ...document, templateRef: null }],
    [{ ...document, templateRef: { templateId: 'x', templateVersion: 0 } }],
    [{ ...document, editableTextState: { ...document.editableTextState, beforeLabel: '<script>' } }],
    [{ ...document, assetBindings: { before: { mediaId: 'not-a-uuid' } } }],
    [{ ...document, renderProfile: { profileKey: 'ultra_8k' } }],
    [{ ...document, audioRef: { mediaId: '33333333-3333-4333-8333-333333333333', startMs: -1, volume: 0.5 } }],
    [{ ...document, audioRef: { mediaId: '33333333-3333-4333-8333-333333333333', startMs: 0, volume: 1.5 } }],
  ])('rejects malformed or out-of-bound document values', (invalid) => {
    expect(() => videoCompositionDocumentV1Schema.parse(invalid)).toThrow();
  });

  it('produces identical canonical JSON regardless of object-key insertion order', () => {
    const reordered: VideoCompositionDocumentV1 = {
      audioRef: null,
      renderProfile: { profileKey: 'preview' },
      styleState: { theme: 'clinical-neutral' },
      editableTextState: { afterLabel: 'After', beforeLabel: 'Before' },
      assetBindings: {
        after: { mediaId: '22222222-2222-4222-8222-222222222222' },
        before: { mediaId: '11111111-1111-4111-8111-111111111111' },
      },
      durationMs: 4_000,
      canvas: { aspectRatioKey: 'portrait_4_5' },
      templateRef: { templateVersion: 1, templateId: 'classic-reveal' },
      schemaVersion: 1 as const,
    };
    expect(canonicalizeVideoCompositionDocument(reordered)).toBe(canonicalizeVideoCompositionDocument(document));
  });

  it('is a stable, deterministic serialization across repeated calls', () => {
    expect(canonicalizeVideoCompositionDocument(document)).toBe(canonicalizeVideoCompositionDocument(document));
  });

  it('enforces a configurable maximum document size', () => {
    expect(() => assertVideoCompositionDocumentSize(document, 16_384)).not.toThrow();
    expect(() => assertVideoCompositionDocumentSize(document, 10)).toThrow();
  });

  it('rejects a non-positive-integer size limit', () => {
    expect(() => assertVideoCompositionDocumentSize(document, 0)).toThrow(RangeError);
    expect(() => assertVideoCompositionDocumentSize(document, -1)).toThrow(RangeError);
  });
});
