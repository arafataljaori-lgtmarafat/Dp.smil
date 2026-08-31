import { describe, expect, it } from 'vitest';

import {
  ConflictError,
  InvalidStateTransitionError,
  ValidationError,
  assertGeneratedAssetProvenance,
  assertGenerationTransition,
  assertSourceMediaImmutable,
} from '../index.js';

describe('Phase 1 domain invariants', () => {
  it('allows only defined generation lifecycle transitions', () => {
    expect(() => assertGenerationTransition('queued', 'processing')).not.toThrow();
    expect(() => assertGenerationTransition('processing', 'succeeded')).not.toThrow();
  });

  it('rejects invalid generation lifecycle transitions', () => {
    expect(() => assertGenerationTransition('succeeded', 'processing')).toThrow(
      InvalidStateTransitionError,
    );
    expect(() => assertGenerationTransition('failed', 'succeeded')).toThrow(
      InvalidStateTransitionError,
    );
  });

  it('does not permit a source asset to be changed into a generated asset', () => {
    expect(() =>
      assertSourceMediaImmutable(
        { id: 'source-1', kind: 'source', sourceMediaId: null },
        { kind: 'generated', sourceMediaId: 'source-1' },
      ),
    ).toThrow(ConflictError);
  });

  it('requires a generated asset to retain complete provenance', () => {
    expect(() =>
      assertGeneratedAssetProvenance({
        media: { id: 'generated-1', kind: 'generated', sourceMediaId: 'source-1' },
        generationJobId: null,
        providerKey: 'mock-smile-simulation',
        providerVersion: 'v1',
      }),
    ).toThrow(ValidationError);
  });
});
