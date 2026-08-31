import { InvalidStateTransitionError, ValidationError } from './errors.js';

export const generationStatuses = [
  'queued',
  'processing',
  'succeeded',
  'failed',
  'cancelled',
] as const;

export type GenerationStatus = (typeof generationStatuses)[number];

export const smileSimulationGenerationContractVersion = 'smile-simulation-v1' as const;

const allowedTransitions: Readonly<Record<GenerationStatus, readonly GenerationStatus[]>> = {
  queued: ['processing', 'cancelled'],
  processing: ['succeeded', 'failed'],
  succeeded: [],
  failed: [],
  cancelled: [],
};

export function canTransitionGeneration(
  from: GenerationStatus,
  to: GenerationStatus,
): boolean {
  return allowedTransitions[from].includes(to);
}

export function assertGenerationTransition(
  from: GenerationStatus,
  to: GenerationStatus,
): void {
  if (!canTransitionGeneration(from, to)) {
    throw new InvalidStateTransitionError(`Cannot transition generation from ${from} to ${to}.`, {
      from,
      to,
    });
  }
}

export interface GenerationProvenance {
  readonly sourceMediaId: string;
  readonly sourceSha256: string;
  readonly generationJobId: string;
  readonly providerKey: string;
  readonly providerVersion: string;
  readonly generationContractVersion: string;
  readonly parameters: Readonly<Record<string, string | number | boolean | null>>;
}

export function assertCompleteProvenance(provenance: GenerationProvenance): void {
  if (
    provenance.sourceMediaId.length === 0 ||
    !/^[a-f0-9]{64}$/i.test(provenance.sourceSha256) ||
    provenance.generationJobId.length === 0 ||
    provenance.providerKey.length === 0 ||
    provenance.providerVersion.length === 0 ||
    provenance.generationContractVersion.length === 0
  ) {
    throw new InvalidStateTransitionError('Generated output must have complete immutable provenance.');
  }
}

export function assertIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (
    normalized.length < 8 ||
    normalized.length > 160 ||
    [...normalized].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    }) ||
    /\s/.test(normalized)
  ) {
    throw new ValidationError('Idempotency key must be 8-160 visible non-whitespace characters.');
  }
  return normalized;
}
