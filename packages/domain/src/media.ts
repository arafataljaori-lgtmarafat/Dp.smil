import { ConflictError, ValidationError } from './errors.js';

export const mediaKinds = ['source', 'derived', 'generated'] as const;
export type MediaKind = (typeof mediaKinds)[number];

export interface MediaIdentity {
  readonly id: string;
  readonly kind: MediaKind;
  readonly sourceMediaId: string | null;
}

export function assertSourceMediaImmutable(
  existing: MediaIdentity,
  proposed: Pick<MediaIdentity, 'kind' | 'sourceMediaId'>,
): void {
  if (existing.kind !== 'source') {
    return;
  }

  if (proposed.kind !== 'source' || proposed.sourceMediaId !== null) {
    throw new ConflictError('Source media cannot be changed into another media kind.');
  }
}

export function assertGeneratedAssetIsNotSource(asset: MediaIdentity): void {
  if (asset.kind !== 'generated' || asset.sourceMediaId === null) {
    throw new ValidationError('Generated media must retain a source media reference.');
  }
}

export function assertGeneratedAssetProvenance(input: {
  readonly media: MediaIdentity;
  readonly generationJobId: string | null;
  readonly providerKey: string | null;
  readonly providerVersion: string | null;
}): void {
  assertGeneratedAssetIsNotSource(input.media);
  if (
    input.generationJobId === null ||
    input.providerKey === null ||
    input.providerVersion === null
  ) {
    throw new ValidationError('Generated media must retain generation provenance.');
  }
}
