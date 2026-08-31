import { CreationBindingRequiredError, ValidationError } from '@dentpilot/domain';
import {
  assertVideoCompositionDocumentSize,
  videoBindingKeySchema,
  videoCompositionDocumentV1Schema,
  type CreationBindingKey,
  type VideoCompositionDocument,
  type VideoTemplateDefinition,
} from '@dentpilot/contracts';

import { requireBuiltInVideoTemplate } from './video-template-catalog.js';
import { resolveVideoTemplateDurationMs, resolveVideoTemplateForDocument, VideoCompositionEvaluationError } from './video-composition-engine.js';
import type { CreationAssetBindingRecord } from './ports.js';

/**
 * Video-document routing, template-integrity, and binding-consistency helpers for Phase
 * 5 Stage 2. Kept in one module because every one of these concerns is specific to
 * VideoCompositionDocumentV1 and none of it is shared with the image document path in
 * creation-service.ts (which keeps its own, separately-maintained validation).
 *
 * Nothing here redesigns the Stage 1 evaluator: resolveVideoTemplateForDocument and
 * canonicalizeVideoCompositionDocument (packages/contracts) remain the sole authorities
 * for template-compatibility and hashing respectively. This module only adds the
 * persistence-facing checks Stage 1 deliberately left to Stage 2: whether a document's
 * declared binding keys are all present, and whether they still agree with the
 * relational CreationAssetBinding rows.
 */

const videoBindingKeys = videoBindingKeySchema.options;

function declaredVideoBindingKeys(document: VideoCompositionDocument): readonly CreationBindingKey[] {
  return videoBindingKeys.filter((key) => document.assetBindings[key] !== undefined);
}

/** Every binding key at least one template segment renders. Order-stable, de-duplicated. */
export function requiredVideoBindingKeys(template: VideoTemplateDefinition): readonly CreationBindingKey[] {
  const required = new Set<CreationBindingKey>();
  for (const segment of template.segments) required.add(segment.bindingKey);
  return videoBindingKeys.filter((key) => required.has(key));
}

/**
 * Parses and fully validates a candidate VideoCompositionDocumentV1: schema shape,
 * exact built-in templateId+version resolution, full Stage 1 evaluator compatibility
 * (aspect ratio, style, duration agreement, audio capability — see
 * resolveVideoTemplateForDocument), that every template-required binding key has a
 * document-level entry, and the configured serialized-size limit. Throws ValidationError
 * (or CreationBindingRequiredError for a missing required key) on any failure — this is
 * the single choke point "Never persist a video draft the Stage 1 evaluator would reject"
 * routes through.
 */
export function validateVideoCreationDocument(input: {
  readonly document: unknown;
  readonly maximumBytes: number;
}): { readonly document: VideoCompositionDocument; readonly template: VideoTemplateDefinition } {
  try {
    const parsed = videoCompositionDocumentV1Schema.parse(input.document);
    const template = requireBuiltInVideoTemplate(parsed.templateRef.templateId, parsed.templateRef.templateVersion);
    resolveVideoTemplateForDocument({ document: parsed, template });
    const required = requiredVideoBindingKeys(template);
    const declared = new Set(declaredVideoBindingKeys(parsed));
    for (const key of required) {
      if (!declared.has(key)) {
        throw new CreationBindingRequiredError(`Video composition document requires binding key: ${key}.`);
      }
    }
    assertVideoCompositionDocumentSize(parsed, input.maximumBytes);
    return { document: parsed, template };
  } catch (error) {
    if (error instanceof CreationBindingRequiredError) throw error;
    const reason = error instanceof VideoCompositionEvaluationError || error instanceof Error ? error.message : 'invalid-document';
    throw new ValidationError('Video composition document is not valid.', { reason });
  }
}

/**
 * Binding/document single-truth invariant (Phase 5 Stage 2), read-path direction: every
 * binding key the document declares must have a persisted CreationAssetBinding row with
 * the identical mediaId. A declared key with no persisted row is treated the same as a
 * missing required binding (CreationBindingRequiredError); a declared key whose persisted
 * mediaId differs is a ValidationError. This is intentionally one-directional — an extra
 * persisted binding the template does not use is not checked here (that constraint
 * belongs to write-time required-key validation, not read-time drift detection).
 */
export function assertVideoDocumentBindingsMatchPersisted(
  document: VideoCompositionDocument,
  bindings: readonly CreationAssetBindingRecord[],
): void {
  const persistedByKey = new Map(bindings.map((binding) => [binding.bindingKey, binding] as const));
  for (const key of declaredVideoBindingKeys(document)) {
    const persisted = persistedByKey.get(key);
    const declaredMediaId = document.assetBindings[key]?.mediaId;
    if (persisted === undefined) {
      throw new CreationBindingRequiredError(`Video document references binding ${key} with no persisted binding.`);
    }
    if (persisted.mediaId !== declaredMediaId) {
      throw new ValidationError(`Video document binding ${key} does not match its persisted media binding.`);
    }
  }
}

/**
 * Write-path direction of the same invariant: given a candidate full replacement binding
 * set (the request body of PUT/PATCH .../bindings), rejects it if any binding key the
 * resolved template requires would be left unbound. Mirrors the image path's identical
 * document-required-binding protection (CreationBindingRequiredError) so a video binding
 * mutation can never silently drop a binding a template still renders.
 */
export function assertRequiredVideoBindingsPresent(
  requiredKeys: readonly CreationBindingKey[],
  candidateBindings: readonly { readonly bindingKey: CreationBindingKey }[],
): void {
  const available = new Set(candidateBindings.map((binding) => binding.bindingKey));
  for (const key of requiredKeys) {
    if (!available.has(key)) throw new CreationBindingRequiredError(`Video composition requires binding key: ${key}.`);
  }
}

/**
 * Rewrites a document's assetBindings to exactly the supplied binding set, leaving every
 * other field (templateRef, canvas, durationMs, editableTextState, styleState,
 * renderProfile, audioRef) untouched. Used only by the binding-replace path, and only
 * after assertRequiredVideoBindingsPresent has already confirmed the candidate set still
 * covers every template-required key — never called with a set that would silently drop
 * one.
 */
export function syncVideoDocumentBindings(
  document: VideoCompositionDocument,
  bindings: readonly { readonly bindingKey: CreationBindingKey; readonly mediaId: string }[],
): VideoCompositionDocument {
  const assetBindings: VideoCompositionDocument['assetBindings'] = {};
  for (const binding of bindings) {
    if (binding.bindingKey === 'before' || binding.bindingKey === 'after') {
      assetBindings[binding.bindingKey] = { mediaId: binding.mediaId };
    }
  }
  return { ...document, assetBindings };
}

/** The initial document for a brand-new video creation: both bindings set from the start (see mission section 3). */
export function initialVideoCompositionDocument(input: {
  readonly beforeMediaId: string;
  readonly afterMediaId: string;
  readonly template: VideoTemplateDefinition;
}): VideoCompositionDocument {
  return {
    schemaVersion: 1,
    templateRef: { templateId: input.template.id, templateVersion: input.template.version },
    canvas: { aspectRatioKey: input.template.aspectRatio },
    durationMs: resolveVideoTemplateDurationMs(input.template),
    assetBindings: {
      before: { mediaId: input.beforeMediaId },
      after: { mediaId: input.afterMediaId },
    },
    editableTextState: { beforeLabel: 'Before', afterLabel: 'After' },
    styleState: { theme: 'clinical-neutral' },
    renderProfile: { profileKey: 'preview' },
    audioRef: null,
  };
}

/**
 * Canonical request payload for video-creation idempotency fingerprinting — mirrors
 * GenerationService's canonicalRequestPayload (fixed manual key order, no need for the
 * generic sorted canonicalizer contracts uses for documents) so two logically identical
 * before_after_video creation requests always fingerprint identically.
 */
export function canonicalVideoCreationRequestPayload(input: {
  readonly ownerUserId: string;
  readonly caseId: string;
  readonly beforeMediaId: string;
  readonly beforeMediaSha256: string;
  readonly afterMediaId: string;
  readonly afterMediaSha256: string;
  readonly templateId: string;
  readonly templateVersion: number;
}): string {
  return JSON.stringify({
    ownerUserId: input.ownerUserId,
    caseId: input.caseId,
    creationType: 'before_after_video',
    beforeMediaId: input.beforeMediaId,
    beforeMediaSha256: input.beforeMediaSha256,
    afterMediaId: input.afterMediaId,
    afterMediaSha256: input.afterMediaSha256,
    templateId: input.templateId,
    templateVersion: input.templateVersion,
  });
}
