# Phase 5 / Stage 2 — Video Persistence & API Graph

> **Final Integrity Closure (authoritative):** The Stage 2 initial report below predates the final integrity micro-closure. The final state adds migration `20260829170000_phase_5_stage_2_idempotency_scope_and_type_check`, scopes creation idempotency to `UNIQUE(ownerUserId, idempotencyKey)`, binds idempotency fields to `before_after_video` at the database boundary, and validates persisted revision documents on read by the persisted project type. Where older text below describes `(ownerUserId, caseId, idempotencyKey)` or a single Stage 2 migration, that wording is historical and superseded by this note and `phase-5-stage-2-final-integrity-audit.md`.

Wires `before_after_video` into the existing Stage-1 creation persistence/API/revision
graph. No parallel video persistence subsystem exists anywhere in this stage: every video
creation is a `CreationProject` row, a `CreationDraft` row, `CreationAssetBinding` rows,
and `CreationRevision`/`CreationRevisionAsset` rows — the exact same five tables the
image path already used, distinguished only by `CreationProject.type`.

## Document routing model

The single fact that decides whether a creation's document is parsed as
`CreationDocumentV1` or `VideoCompositionDocumentV1` is the persisted
`CreationProject.type`. It is never `schemaVersion` (both documents currently share
`schemaVersion: 1` and always will unless a document shape itself changes) and never the
document's own shape.

- **Write boundary** (`packages/contracts/src/index.ts`): `createCreationRequestSchema`
  is a `z.discriminatedUnion('type', [createBeforeAfterImageRequestSchema,
  createBeforeAfterVideoRequestSchema])`. Zod's discriminated union rejects a payload the
  instant its `type` literal does not match one arm's schema exactly — an
  `image`-labeled payload with video fields, or vice versa, fails to parse before any
  service code runs.
- **Application boundary** (`packages/application/src/creation-service.ts`):
  `requireCreationProject` is the only place any of `getCreation`, `replaceBindings`,
  `updateDraft`, `createRevision`, `listRevisions`, `getRevision`, and the new
  `getCreationProject` resolve which project they are acting on. Every one of those
  methods immediately branches `if (project.type === 'before_after_video') { ... } else {
  ... }` and calls exactly one of `validateVideoCreationDocument` /
  `validateImageDocument` — never both, never a shape probe. A video project whose
  persisted document somehow failed to parse as `VideoCompositionDocumentV1` surfaces a
  `ValidationError`, not a silent fallback to the image parser (and symmetrically for an
  image project).
- **API boundary** (`apps/api/src/controllers/creations.controller.ts`): every shared
  endpoint (`GET/PUT/PATCH .../bindings`, `.../draft`, `.../revisions[/:id]`) looks up
  `project.type` via the new `CreationService.getCreationProject` — a thin, read-only
  wrapper around the same `requireCreationProject` lookup every mutation already
  performs — purely to choose between `presentCreationDraft`/`presentVideoCreationDraft`
  (and the revision equivalents). This is a presentation choice made from the persisted
  record, not a second routing decision; the service has already routed and validated the
  document by the time the controller presents it.

## Reused persistence graph

No new video-only tables. `apps/api/prisma/schema.prisma`'s `CreationProject`,
`CreationAssetBinding`, `CreationDraft`, `CreationRevision`, and `CreationRevisionAsset`
models are unchanged in shape apart from two new nullable columns on `CreationProject`
(`idempotencyKey`, `requestFingerprint` — see Idempotency below). `CreationDraft.document`
and `CreationRevision.document` were already untyped `Json` columns in Stage 1; at the
application layer, `CreationDraftRecord.document` and `CreationRevisionRecord.document`
(packages/application/src/ports.ts) are now typed `CreationDocument |
VideoCompositionDocument` — a union, not a redesign — reflecting that the same columns
now legitimately hold either document depending on the owning project's type.

## Video creation transaction

`CreationService.createBeforeAfterVideo` (packages/application/src/creation-service.ts):

1. Validates the case belongs to the actor and both Before and After media belong to
   that case (mirrors the image path's ownership/case checks).
2. Resolves the one built-in default video template (`classic-reveal@1`, see
   `video-template-catalog.ts`) via `requireBuiltInVideoTemplate` — an exact id+version
   lookup, never a version-less or fuzzy match.
3. Builds the initial `VideoCompositionDocumentV1` (`initialVideoCompositionDocument`,
   `packages/application/src/video-creation-document.ts`) with both bindings already
   populated — a video composition is only meaningful once both segments it renders have
   media, unlike a fresh image creation, which starts bound only to its one source photo.
4. Computes the request fingerprint (see Idempotency) and, inside one
   `unitOfWork.transaction`, claims the idempotency slot, then creates the draft,
   replaces the bindings, and appends exactly one `CreationProjectCreated` audit event.

All four writes (project, draft, bindings, audit) happen inside the same
`unitOfWork.transaction` callback the image path already used — no new transaction
mechanism, no partial commit path. If any step throws, `PrismaUnitOfWork`'s underlying
`$transaction` rolls back every write in the callback; the in-memory test fake used at
the application layer (`creation-service-video.test.ts`) reproduces the same
all-or-nothing guarantee with a per-transaction undo log (see that file's header comment)
so the failure/rollback scenarios in mission section 10 are exercised meaningfully even
without a live database in this sandbox.

## Binding/document single-truth invariant and its sync semantics

`document.assetBindings[key].mediaId` must always equal the persisted
`CreationAssetBinding` row's `mediaId` for that key. This is enforced in both directions:

- **Read path** — `assertVideoDocumentBindingsMatchPersisted`
  (`video-creation-document.ts`), called from `getCreation` and immediately before every
  revision snapshot in `createRevision`. A declared binding key with no persisted row is
  `CreationBindingRequiredError`; a declared key whose persisted `mediaId` differs is
  `ValidationError`.
- **Write path** — `replaceBindings` calls `syncVideoDocumentBindings` to rewrite the
  document's `assetBindings` to exactly the new binding set, then passes that rewritten
  document to `CreationDocumentRepositoryPort.replaceBindingsIfRevision` via its optional
  `document` field. `PrismaUnitOfWork.creations.replaceBindingsIfRevision`
  (`apps/api/src/infrastructure/persistence/prisma-unit-of-work.ts`) writes that document
  in the *same* `creationDraft.updateMany({ where: { revision: expectedRevision }, data:
  { revision: { increment: 1 }, document, schemaVersion: 1 } })` statement that claims the
  revision bump — the same compare-and-swap, not a second write. The relational bindings
  this call replaces immediately afterward and the document it just wrote can never be
  observed out of sync, because nothing can read the row between those two writes without
  also seeing the new revision number. Image callers never pass `document` here — image
  documents don't embed `mediaId`, so an image binding mutation still only bumps the
  revision, exactly as in Stage 1.

## Optimistic concurrency (CAS)

Every mutation that changes a draft's revision does so with a single `WHERE revision =
expectedRevision` conditional write, never a separate check-then-write pair outside a
transaction:

- `replaceBindingsIfRevision` / `updateDraftIfRevision`: `updateMany` with `revision` in
  the `where` clause; `count !== 1` means someone else already advanced the revision, and
  the service maps that to `CreationRevisionConflictError`.
- `createRevision`: claims the draft-revision bump the same way, then inserts the
  immutable revision row — if the resolved-bindings snapshot taken immediately after no
  longer covers every template-required key (a race against a concurrent binding change),
  the whole call returns `null`, the service throws `CreationRevisionConflictError`, and
  the enclosing transaction rolls back the already-inserted revision row along with the
  revision-number bump. No orphaned revision can survive a losing race.

The service-layer read (`findDraft`) that runs before either CAS call in
`replaceBindings`/`updateDraft` is only a fast-fail pre-check for the common case; it is
never load-bearing for correctness by itself; the actual conflict decision is always the
database-level CAS. The application-layer test fake reproduces this precisely: its CAS
helpers perform their "read current value, then write" step with no `await` between them
(see `creation-service-video.test.ts`'s file header), so two truly concurrent callers can
never both win — exactly as a real `WHERE revision = expectedRevision` UPDATE guarantees
under Postgres's MVCC.

## Immutable revision snapshot & hashing

`createRevision` re-validates, at the moment of snapshotting: project type (via the
already-resolved `project.type` branch), the document against the video evaluator
(`validateVideoCreationDocument` — template id+version, aspect ratio, style, duration,
audio capability), document↔binding agreement
(`assertVideoDocumentBindingsMatchPersisted`), and takes the exact set of persisted
bindings the resolved template requires as the revision's binding snapshot
(`requiredVideoBindingKeys`). The document hash uses
`canonicalizeVideoCompositionDocument` (packages/contracts) unchanged from Stage 1 — this
stage does not redesign or touch that function, or its image counterpart
`canonicalizeCreationDocument`. Both hashing functions are dispatched from the same
`project.type` branch that decided which validator ran, never inferred separately.

## Idempotency (before_after_video creation only)

Production-grade, database-enforced idempotency for `POST /cases/:caseId/creations` when
`type: 'before_after_video'`:

- **Contract**: `Idempotency-Key` request header, validated by the existing
  `idempotencyKeySchema` (8–160 visible, non-whitespace characters) — the same schema
  `generations`/`media-upload-sessions` already use.
- **Fingerprint**: `canonicalVideoCreationRequestPayload`
  (`video-creation-document.ts`) — a fixed-key-order JSON payload of owner, case, both
  media ids and their sha256 hashes, and the resolved template id+version — hashed with
  the same `DigestPort.sha256` used everywhere else.
- **Database enforcement**: a new minimal migration
  (`apps/api/prisma/migrations/20260829160000_phase_5_stage_2_video_creation_idempotency`)
  adds two nullable columns to `CreationProject` — `idempotencyKey`, `requestFingerprint`
  — and a `UNIQUE (ownerUserId, caseId, idempotencyKey)` index, plus a `CHECK
  (("idempotencyKey" IS NULL) = ("requestFingerprint" IS NULL))` pair constraint.
  Postgres treats every `NULL` in a unique index as distinct from every other `NULL`, so
  every existing `before_after_image`/`smile_simulation` project (which never sets these
  columns) is completely unaffected — this was verified directly against a live
  PostgreSQL 16 instance in this sandbox (see the Execution Report's migration validation
  section), not just reasoned about.
- **Claim mechanism**: `ProjectRepositoryPort.createOrFindByIdempotency`
  (`packages/application/src/ports.ts`), implemented in
  `PrismaUnitOfWork.projects.createOrFindByIdempotency` as a single `INSERT ... ON
  CONFLICT ("ownerUserId", "caseId", "idempotencyKey") DO NOTHING RETURNING ...` — the
  exact same pattern already proven in this codebase by
  `GenerationRepositoryPort`/`MediaUploadSessionRepositoryPort`'s own
  `createOrFindByIdempotency` methods. Zero rows returned means another request already
  claimed the slot; the code falls through to a `findFirstOrThrow` scoped to the same
  three columns. There is no application-level find-then-insert race: the claim is one
  atomic statement.
- **Replay semantics**: `CreationService.createBeforeAfterVideo` compares
  `project.requestFingerprint` against the freshly computed fingerprint regardless of
  which branch won the claim. Identical key + identical fingerprint returns the original
  graph (`created: false`) without creating a second draft/binding/audit graph and
  without appending a second audit event. Identical key + different fingerprint throws
  `IdempotencyConflictError` before any further writes. Concurrent identical requests:
  exactly one wins the `INSERT ... ON CONFLICT`, so exactly one graph (draft + bindings +
  audit event) is ever created — verified in both the in-memory application test
  (`creation-service-video.test.ts`) and the (environment-blocked, see Execution Report)
  real-database integration test (`creation-video-domain.integration.test.ts`).
- **Scope**: `GenerationJob` is not reused — `before_after_video` creation has its own
  idempotency slot on `CreationProject`, because it produces a whole persistence graph
  rather than a single job row. Legacy image creation (`createBeforeAfterImage`) is
  completely untouched: it takes no idempotency key, sets both new columns to `null`, and
  keeps creating a fresh project on every call, exactly as in Stage 1. This was a
  deliberate compatibility decision (mission section 7): extending idempotency to image
  creation was judged unnecessary scope for this stage and was not done.

## API contracts

- `createCreationRequestSchema` (discriminated union, see Routing above).
- `updateCreationDraftRequestSchema.document`: `z.union([creationDocumentSchema,
  videoCompositionDocumentV1Schema])` — accepts either shape without collapsing it to
  `unknown`/`any`; which one actually validates is still decided by
  `CreationService.updateDraft`'s `project.type` branch, not by which union arm happened
  to parse.
- New response DTOs: `videoCreationDraftSchema`, `videoCreationRevisionSchema`,
  `videoCreationDetailsSchema` (packages/contracts/src/index.ts) — video-shaped
  counterparts of the existing `creationDraftSchema`/`creationRevisionSchema`, each
  `.strict()`.
- New presenters: `presentVideoCreationDraft`, `presentVideoCreationRevision`
  (`apps/api/src/controllers/api-presenters.ts`) — structural counterparts of
  `presentCreationDraft`/`presentCreationRevision`. Both existing image presenters now
  carry an explicit `as CreationDocument` narrowing cast on their `document` field,
  because `CreationDraftRecord`/`CreationRevisionRecord.document` is now the
  `CreationDocument | VideoCompositionDocument` union at the port level; the narrowing
  reflects a fact the caller (the controller, which only reaches these presenters for
  `before_after_image` projects) has already established via `project.type`, not a new
  routing decision made inside the presenter.
- No resource model was duplicated for video: `GET/PUT/PATCH .../bindings`, `.../draft`,
  `.../revisions[/:id]` are the same routes and the same `CreationsController` for both
  project types.

## Explicitly out of scope (unchanged from the mission)

No work was done on: timeline UI, real-time video preview, encoder/export
implementation, audio playback, premium template catalog expansion, Smile AI, generative
video, provider SDKs, or billing. No mobile app code was touched.
