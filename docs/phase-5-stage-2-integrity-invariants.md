# Phase 5 / Stage 2 — Integrity Invariants

> **Final Integrity Closure (authoritative):** The Stage 2 initial report below predates the final integrity micro-closure. The final state adds migration `20260829170000_phase_5_stage_2_idempotency_scope_and_type_check`, scopes creation idempotency to `UNIQUE(ownerUserId, idempotencyKey)`, binds idempotency fields to `before_after_video` at the database boundary, and validates persisted revision documents on read by the persisted project type. Where older text below describes `(ownerUserId, caseId, idempotencyKey)` or a single Stage 2 migration, that wording is historical and superseded by this note and `phase-5-stage-2-final-integrity-audit.md`.

Each invariant below states the rule, where it is enforced, and where it is tested. See
`docs/phase-5-stage-2-video-persistence-api.md` for the fuller design narrative.

## 1. Document routing invariant

**Rule**: a creation's document is parsed as `VideoCompositionDocumentV1` if and only if
its persisted `CreationProject.type === 'before_after_video'`; otherwise it is parsed as
`CreationDocumentV1`. Never decided by `schemaVersion` (identical across both documents)
or by probing the document's own shape.

**Enforced by**: `CreationService.requireCreationProject` (single resolution point for
every shared method) branching on `project.type`; `createCreationRequestSchema`'s
`z.discriminatedUnion('type', ...)` at the wire boundary.

**Tested by**:
- `packages/contracts/src/__tests__/video-creation-api.test.ts` — "never lets one
  variant's shape satisfy the other", unknown/missing type rejected.
- `packages/application/src/__tests__/creation-service-video.test.ts` — "routes by
  persisted project.type, not by document shape" (both directions: image-shaped document
  rejected on a video project, video-shaped document rejected on an image project).

## 2. No parallel persistence subsystem

**Rule**: video creations use the same five tables Stage 1 already had
(`CreationProject`, `CreationAssetBinding`, `CreationDraft`, `CreationRevision`,
`CreationRevisionAsset`); no video-only table exists.

**Enforced by**: `apps/api/prisma/schema.prisma` — the only schema change is two new
nullable columns and one unique index on the existing `CreationProject` model (see
invariant 6). No new `model` block was added.

**Tested by**: inspection (this document + the Execution Report's exact changed-file
list); the migration itself only ever runs `ALTER TABLE`/`CREATE UNIQUE INDEX` against
`creation_projects`.

## 3. Binding/document single-truth invariant

**Rule**: `document.assetBindings[key].mediaId` must always equal the persisted
`CreationAssetBinding` row's `mediaId` for that key. A binding mutation updates both the
relational rows and `document.assetBindings` in the same transaction, under the same CAS
claim.

**Enforced by**: `assertVideoDocumentBindingsMatchPersisted` (read-path, called from
`getCreation` and before every revision snapshot); `syncVideoDocumentBindings` +
`replaceBindingsIfRevision`'s optional `document` parameter (write-path — the document is
written by the exact same `WHERE revision = expectedRevision` `updateMany` statement that
replaces the bindings, in `PrismaUnitOfWork.creations.replaceBindingsIfRevision`).

**Tested by**:
- `creation-service-video.test.ts` — "replaces a binding and keeps
  document.assetBindings synchronized in the same atomic write"; "rejects revision
  creation when a persisted binding no longer matches the draft document (binding/document
  drift)".
- `apps/api/test/integration/creation-video-domain.integration.test.ts` — "binding/document
  single-truth invariant: a binding replacement updates the relational row and
  document.assetBindings atomically" (real Postgres row read back and compared); "gives
  exactly one binding-replacement CAS winner under concurrency, with the document staying
  in sync with whichever binding set won" (environment-blocked in this sandbox — see
  Execution Report).

## 4. Optimistic concurrency (no check-then-write race outside the database)

**Rule**: a stale `expectedRevision` always produces a typed conflict
(`CreationRevisionConflictError`); a successful mutation increments the revision exactly
once; the binding+document sync described in invariant 3 is one atomic CAS operation, not
two separate writes.

**Enforced by**: every revision-bumping write is a single conditional SQL statement
(`updateMany`/raw `UPDATE ... WHERE revision = $expected`) — `updateDraftIfRevision`,
`replaceBindingsIfRevision`, and the draft-revision claim inside `createRevision`.

**Tested by**:
- `creation-service-video.test.ts` — "rejects a stale expectedRevision on binding
  replacement"; "concurrent binding replacements at the same expected revision: exactly
  one wins" (the in-memory fake's CAS helpers perform their read-then-write with no
  `await` gap, so this test observes a genuine single-winner race, not an artifact of
  sequential execution — see that file's header comment).
- `creation-video-domain.integration.test.ts` — the same concurrency scenario against
  real PostgreSQL (environment-blocked in this sandbox).

## 5. Immutable revision invariant

**Rule**: a revision snapshots the validated document, its canonical SHA-256, and
exactly the bindings the resolved template requires; project type, the video parser,
template compatibility, document↔binding equality, and asset owner/case are all
revalidated immediately before the insert; once created, a revision never changes even
if the draft or its bindings later do.

**Enforced by**: `CreationService.createRevision`'s video branch — calls
`validateVideoCreationDocument` (re-parses + re-resolves the template + re-runs the Stage
1 evaluator's compatibility checks), then `assertVideoDocumentBindingsMatchPersisted`,
then hashes with `canonicalizeVideoCompositionDocument` (unmodified from Stage 1), then
persists via `createRevision`, which itself re-derives the binding snapshot from
currently-persisted bindings filtered to exactly `requiredVideoBindingKeys` and aborts
(returns `null`, causing full transaction rollback) if that snapshot doesn't cover every
required key.

**Tested by**:
- `creation-service-video.test.ts` — "creates an immutable video revision whose hash
  matches canonicalizeVideoCompositionDocument and snapshots exactly the required
  bindings"; "a video revision is immutable: later binding changes do not affect an
  already-created revision snapshot".
- `creation-video-domain.integration.test.ts` — the same, plus a direct attempt to
  mutate a persisted revision's `documentSha256` via Prisma, asserted to be rejected
  (mirrors the pre-existing Stage 1 image-revision immutability test; environment-blocked
  in this sandbox).

## 6. Production-grade idempotency (video creation only)

**Rule**: same Idempotency-Key + same request fingerprint replays the original graph;
same key + different fingerprint is a typed conflict; concurrent identical requests
create exactly one graph; retries never duplicate the audit event; no application-level
find-then-insert race; `GenerationJob` is not reused; legacy image creation keeps its
existing non-idempotent behavior unchanged.

**Enforced by**: `CreationProject.idempotencyKey`/`requestFingerprint` (new nullable
columns, additive migration
`20260829160000_phase_5_stage_2_video_creation_idempotency`) plus a `UNIQUE
(ownerUserId, caseId, idempotencyKey)` index and a key/fingerprint pair `CHECK`
constraint; `ProjectRepositoryPort.createOrFindByIdempotency`'s `INSERT ... ON CONFLICT
... DO NOTHING RETURNING` claim; `CreationService.createBeforeAfterVideo`'s fingerprint
comparison and single audit-append (only on the `created: true` branch).

**Tested by**:
- `creation-service-video.test.ts` — "idempotent replay", "idempotency conflict",
  "concurrent identical creation requests produce exactly one graph and exactly one audit
  event".
- `packages/contracts/src/__tests__/api-boundaries.test.ts` (pre-existing,
  `idempotencyKeySchema` coverage, unmodified) plus the create-request-shape tests in
  `video-creation-api.test.ts`.
- `creation-video-domain.integration.test.ts` — the same scenarios against real
  PostgreSQL, including a direct row count assertion on `creation_projects` (environment-
  blocked in this sandbox); the underlying `ON CONFLICT DO NOTHING` / NULL-distinctness /
  pair-`CHECK` mechanics were additionally verified directly against a live PostgreSQL 16
  instance via raw SQL during migration authoring (see Execution Report).

## 7. API/type boundary integrity

**Rule**: contracts safely represent `CreationDocumentV1 | VideoCompositionDocumentV1`
without losing the project-type discriminator; no `unknown`/`any`; no downstream
shape-inference; strict contracts; one ownership-safe resource model, no duplicate
video-only backend.

**Enforced by**: `updateCreationDraftRequestSchema.document` as a `z.union` of the two
concrete document schemas (never `z.unknown()`); `CreationDraftRecord`/
`CreationRevisionRecord.document` typed as a union at the port level, narrowed with an
explicit `as` cast only at the exact point each branch has already established which
member it is (never used to re-decide routing); every new/changed schema is `.strict()`;
one `CreationsController` and one set of routes for both project types.

**Tested by**: `video-creation-api.test.ts` (union round-trips, strict-mode unknown-field
rejection); `apps/api` typecheck of `creations.controller.ts`/`api-presenters.ts`
(clean — see Execution Report).

## 8. Template integrity

**Rule**: every video create/update/revision path resolves the template by exact
id+version, rejects unknown versions, validates aspect ratio/style/duration/audio
capability per the Stage 1 evaluator, and never persists a document the evaluator would
reject. No new templates were added.

**Enforced by**: `requireBuiltInVideoTemplate` (exact id+version lookup, throws on
mismatch) called from every one of `createBeforeAfterVideo`, `updateDraft`,
`replaceBindings`, and `createRevision`'s video branches, always followed by
`resolveVideoTemplateForDocument` (Stage 1's own evaluator, untouched).

**Tested by**: `creation-service-video.test.ts` — "rejects an unknown video template
id/version"; "rejects an audio reference the resolved template does not accept".

## 9. Security/graph integrity

**Rule**: owner isolation, case isolation, project-case consistency,
binding-media-case consistency, revision-project-case consistency; no public media URLs;
no source bytes/base64 in logs; no cross-account ID oracle; no provider secrets; no
mutable overwrite of source media; prefer DB composite constraints over app-only checks;
never weaken an existing FK/unique constraint.

**Enforced by**: every lookup in `CreationService` is scoped by `ownerUserId` (derived
from the actor, never client-supplied) via `unitOfWork.projects/media/cases.findById`;
`requireCreationProject` returns `NotFoundError` (not a distinguishable
forbidden/not-found pair) for both "doesn't exist" and "exists but isn't yours" — no ID
oracle. No new FK or unique constraint was narrowed; the one new unique index
(`ownerUserId, caseId, idempotencyKey`) and the one new `CHECK` constraint are both
additive.

**Tested by**: `creation-service-video.test.ts` — "rejects a case that does not belong to
the requesting owner"; "cross-owner isolation: another owner cannot read, mutate, or
reveal the existence of a video creation" (asserts `NotFoundError`, not a different error
type, for a foreign owner — no oracle); "rejects Before/After media that does not belong
to the selected case". `creation-video-domain.integration.test.ts` mirrors all three
against real Postgres FK/unique constraints.

## 10. Failure/rollback (no orphaned graph state)

**Rule**: every partial-progress failure scenario (project insert ok/draft fails, draft
ok/binding fails, binding conflict, audit fails, revision row fails, incomplete asset
snapshot, idempotent retry after a lost response) leaves no orphaned state.

**Enforced by**: every write path is one `unitOfWork.transaction` callback; a thrown
error anywhere inside it rolls back every write already made in that callback (Postgres
`$transaction` semantics for `PrismaUnitOfWork`; an explicit per-transaction undo log for
the in-memory application-test fake — see that file's header comment for why a
whole-store snapshot/restore would have been wrong under concurrency).

**Tested by**: `creation-service-video.test.ts` — "rejects revision creation when a
persisted binding no longer matches the draft document" indirectly proves rollback
(the revision claim's draft-revision bump is undone when the required-bindings check
fails downstream — verified by the subsequent `getCreation` call still seeing the
original, unbumped state was never observed as visible in between); the concurrency
tests ("concurrent identical creation requests...", "concurrent binding replacements...")
directly prove the losing branch's writes never leak into final state. Full
production-transaction rollback semantics (a mid-transaction Postgres error actually
aborting the whole statement batch) are only fully provable against a live database —
`creation-video-domain.integration.test.ts` carries the equivalent real-DB assertions,
environment-blocked in this sandbox (see Execution Report).
