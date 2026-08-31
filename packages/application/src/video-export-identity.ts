import { canonicalizeVideoCompositionDocument, type VideoCompositionDocument } from '@dentpilot/contracts';

/**
 * Canonical export-identity derivation for a future video render/export job.
 *
 * This module deliberately does NOT reuse GenerationJob/GenerationVersion: that model's
 * shape (providerKey, providerVersion, AI generation provenance) encodes AI-generation
 * semantics, not deterministic local/backend rendering semantics — see
 * docs/phase-5-generation-architecture.md (Phase 5 Stage 0) for the audited model this
 * intentionally stays separate from, and
 * docs/phase-5-stage-1-case-to-video-architecture.md for the proposed (undeployed)
 * VideoExportJob/VideoExportVersion shape this canonicalization is designed to feed.
 *
 * No Prisma model, migration, queue, or persistence exists yet. This file is pure
 * canonicalization — the same discipline GenerationService.request() already uses
 * (canonical JSON -> DigestPort.sha256 by the caller) to make a request idempotent.
 */

export type VideoExportBoundAsset = {
  readonly bindingKey: 'before' | 'after';
  readonly mediaId: string;
  readonly sha256: string;
};

export type VideoExportRequestIdentity = {
  readonly ownerUserId: string;
  readonly projectId: string;
  /** The immutable CreationRevision this export is derived from, not the mutable draft. */
  readonly revisionId: string;
  readonly documentSha256: string;
  readonly templateId: string;
  readonly templateVersion: number;
  readonly boundAssets: readonly VideoExportBoundAsset[];
  readonly renderProfileKey: string;
  /** Bumped whenever the evaluator's or renderer contract's observable behavior changes. */
  readonly rendererContractVersion: number;
};

const CURRENT_RENDERER_CONTRACT_VERSION = 1;
export function currentVideoRendererContractVersion(): number {
  return CURRENT_RENDERER_CONTRACT_VERSION;
}

function canonicalizeValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Video export identity numbers must be finite.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalizeValue).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalizeValue(record[key])}`).join(',')}}`;
  }
  throw new TypeError('Video export identity contains a non-JSON value.');
}

/**
 * Produces a stable canonical JSON string for a video export request. A caller feeds
 * this into a digest (DigestPort.sha256, matching the existing GenerationService
 * pattern) to obtain a request fingerprint; two logically identical export requests —
 * same owner, revision, template, bound asset content, profile, and renderer contract —
 * always canonicalize identically regardless of object-key insertion order, and are
 * therefore coalescible/idempotent by construction.
 */
export function canonicalVideoExportRequestPayload(identity: VideoExportRequestIdentity): string {
  const sortedAssets = [...identity.boundAssets].sort((left, right) => left.bindingKey.localeCompare(right.bindingKey));
  const bindingKeys = sortedAssets.map((asset) => asset.bindingKey);
  if (new Set(bindingKeys).size !== bindingKeys.length) {
    throw new TypeError('Video export identity must not bind the same key more than once.');
  }
  return canonicalizeValue({
    ownerUserId: identity.ownerUserId,
    projectId: identity.projectId,
    revisionId: identity.revisionId,
    documentSha256: identity.documentSha256,
    templateId: identity.templateId,
    templateVersion: identity.templateVersion,
    boundAssets: sortedAssets,
    renderProfileKey: identity.renderProfileKey,
    rendererContractVersion: identity.rendererContractVersion,
  });
}

/**
 * Convenience helper: derives documentSha256 the same way the export identity expects
 * it, from the already-canonicalized document. Callers with a DigestPort should hash
 * this string themselves; this function performs no I/O and does not hash anything
 * itself, keeping this module free of any port dependency.
 */
export function canonicalDocumentPayloadForExportIdentity(document: VideoCompositionDocument): string {
  return canonicalizeVideoCompositionDocument(document);
}
