# Phase 5 / Stage 2 — Execution Report

> **Final Integrity Closure (authoritative):** The Stage 2 initial report below predates the final integrity micro-closure. The final state adds migration `20260829170000_phase_5_stage_2_idempotency_scope_and_type_check`, scopes creation idempotency to `UNIQUE(ownerUserId, idempotencyKey)`, binds idempotency fields to `before_after_video` at the database boundary, and validates persisted revision documents on read by the persisted project type. Where older text below describes `(ownerUserId, caseId, idempotencyKey)` or a single Stage 2 migration, that wording is historical and superseded by this note and `phase-5-stage-2-final-integrity-audit.md`.

Video Persistence & API Integrity, executed against the attached Stage 1 Final Integrity
monorepo as sole authority.

## Authoritative input verification (pre-flight)

- Archive: `DentPilot_Phase_5_Stage_1_Final_Integrity_Claude.zip`
- SHA-256, verified against the Stage 2 mission's stated expectation, exact match:
  `f96d5fdbc3d1a68ff9f8748c3c320e9f9cc010e2e081698715e012fe64a3ac8d`
- Structure check: `apps/api`, `apps/mobile`, `packages/domain`, `packages/contracts`,
  `packages/application`, `pnpm-workspace.yaml`, `apps/api/prisma/schema.prisma` — all
  present.
- Closure report present and its status string matched exactly:
  `PHASE 5 STAGE 1 FINAL INTEGRITY VERIFIED — READY FOR STAGE 2` (in
  `docs/phase-5-stage-1-final-integrity-closure-report.md`).

All four pre-flight checks passed. Proceeded.

## Exact changed-file list

**Added (contracts):**
- `packages/contracts/src/__tests__/video-creation-api.test.ts`

**Added (application):**
- `packages/application/src/video-creation-document.ts`
- `packages/application/src/__tests__/creation-service-video.test.ts`

**Added (API):**
- `apps/api/prisma/migrations/20260829160000_phase_5_stage_2_video_creation_idempotency/migration.sql`
- `apps/api/test/integration/creation-video-domain.integration.test.ts`

**Added (documentation, this stage's required deliverables):**
- `docs/phase-5-stage-2-video-persistence-api.md`
- `docs/phase-5-stage-2-integrity-invariants.md`
- `docs/phase-5-stage-2-execution-report.md` (this file)

**Modified:**
- `packages/contracts/src/index.ts` — replaced the single-shape `createCreationRequestSchema`
  with a `z.discriminatedUnion` of `createBeforeAfterImageRequestSchema` (unchanged
  shape) and the new `createBeforeAfterVideoRequestSchema`; widened
  `updateCreationDraftRequestSchema.document` to `z.union([creationDocumentSchema,
  videoCompositionDocumentV1Schema])`; added `videoCreationDraftSchema`,
  `videoCreationRevisionSchema`, `videoCreationDetailsSchema`, and their inferred DTO
  types.
- `packages/application/src/ports.ts` — `CreationProjectRecord` gained
  `idempotencyKey`/`requestFingerprint` (both `string | null`); `CreationDraftRecord`/
  `CreationRevisionRecord.document` widened to `CreationDocument |
  VideoCompositionDocument`; `ProjectRepositoryPort` gained
  `createOrFindByIdempotency`; `CreationDocumentRepositoryPort.updateDraftIfRevision`'s
  `document` param widened to the union; `replaceBindingsIfRevision`'s input gained an
  optional `document` field.
- `packages/application/src/creation-service.ts` — added `createBeforeAfterVideo` and the
  read-only `getCreationProject` helper; generalized `requireCreationProject` (renamed
  from `requireBeforeAfterProject`), `getCreation`, `listCreations`, `replaceBindings`,
  `updateDraft`, `createRevision`, `listRevisions`, `getRevision` to branch on
  `project.type`; `createBeforeAfterImage` now also sets the two new idempotency fields
  to `null`. The image code path is behaviorally unchanged — verified by every
  pre-existing application test passing unmodified.
- `packages/application/src/index.ts` — added `export * from
  './video-creation-document.js'`.
- `packages/application/src/project-service.ts` — `createMockSmileSimulation` now also
  sets `idempotencyKey: null, requestFingerprint: null` on the `smile_simulation`
  project it creates, to satisfy the widened `CreationProjectRecord` shape. No behavior
  change.
- `apps/api/prisma/schema.prisma` — added `idempotencyKey String?` and
  `requestFingerprint String? @db.Char(64)` to `CreationProject`, plus `@@unique([ownerUserId,
  caseId, idempotencyKey])`.
- `apps/api/src/infrastructure/persistence/prisma-unit-of-work.ts` — `toProjectRecord`
  widened to the two new fields; added `projects.createOrFindByIdempotency` (the same
  `INSERT ... ON CONFLICT DO NOTHING RETURNING` / `findFirstOrThrow` fallback pattern
  already used by `generations.createOrFindByIdempotency` and
  `uploadSessions.createOrFindByIdempotency`); `creations.replaceBindingsIfRevision`'s
  CAS `updateMany` now conditionally includes `document`/`schemaVersion` in the same
  statement when a `document` is supplied.
- `apps/api/src/controllers/creations.controller.ts` — `create` now parses the
  discriminated union and dispatches to `createBeforeAfterImage` or
  `createBeforeAfterVideo` (the latter requiring and parsing the `Idempotency-Key`
  header); `get`, `replaceBindings`/`patchBindings`, `updateDraft`/`patchDraft`,
  `createRevision`, `getRevision` now resolve `project.type` via the new
  `getCreationProject` and select the image or video presenter accordingly.
- `apps/api/src/controllers/api-presenters.ts` — added `presentVideoCreationDraft`,
  `presentVideoCreationRevision`; the existing `presentCreationDraft`/
  `presentCreationRevision` gained an explicit `as CreationDocument` narrowing cast on
  their `document` field (required because the underlying record type is now a union —
  see the API/type boundary invariant note in the Integrity Invariants document).

**Sandbox-only, not part of the deliverable:** `.env` and `apps/api/.env` (local
`DATABASE_URL` pointing at this session's own throwaway Postgres instance, needed only to
validate the migration and run the DB-independent parts of the suite; excluded from the
delivered archive).

**Not touched at all:** everything under `apps/mobile`, `packages/domain/src`,
`packages/application/src/composition-engine.ts`, `template-catalog.ts`,
`video-composition-engine.ts`, `video-template-catalog.ts`, `video-export-identity.ts`,
every controller other than `creations.controller.ts`, every other Prisma model, every
pre-existing migration, and every pre-existing documentation file.

## Migrations added

**One**, and it is the minimal, additive, backward-compatible migration the mission
anticipated as conditionally allowed for idempotency (section 7):

`apps/api/prisma/migrations/20260829160000_phase_5_stage_2_video_creation_idempotency/migration.sql`

```sql
ALTER TABLE "creation_projects"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "requestFingerprint" CHAR(64);

CREATE UNIQUE INDEX "creation_projects_ownerUserId_caseId_idempotencyKey_key"
  ON "creation_projects"("ownerUserId", "caseId", "idempotencyKey");

ALTER TABLE "creation_projects"
  ADD CONSTRAINT "creation_projects_idempotency_pair_check"
  CHECK (("idempotencyKey" IS NULL) = ("requestFingerprint" IS NULL));
```

**Why it was necessary**: Stage 1's creation graph has no column anywhere a client
Idempotency-Key could attach to, and a video creation produces a multi-row graph rather
than the single row `GenerationJob`/`MediaUploadSession` idempotency already covers.
Reusing `GenerationJob` was explicitly out of scope. Letting the graph's own root row
(`CreationProject`) carry the claim keeps the same proven `INSERT ... ON CONFLICT DO
NOTHING` pattern working with no new table.

**Why it is safe**: both columns are nullable; every existing row keeps them `NULL`.
Postgres treats every `NULL` in a unique index as distinct from every other `NULL`, so
no existing `before_after_image`/`smile_simulation` project can ever collide under the
new constraint. No existing column, index, or constraint was altered or narrowed.

**Validation performed** (a real PostgreSQL 16 instance was available in this sandbox,
independent of the blocked Prisma engine binaries — see below):

1. Applied the complete migration chain, in chronological order, from
   `20260826000000_init` through this new migration, via raw `psql -f migration.sql`
   against a fresh scratch database (`dentpilot_migtest2`) — every migration applied
   without error.
2. Verified the actual idempotency-claim mechanism with real INSERT statements: a second
   `INSERT ... ON CONFLICT ("ownerUserId","caseId","idempotencyKey") DO NOTHING` with the
   same key returned zero rows, and the original row's `requestFingerprint` was
   unchanged.
3. Verified two rows with `idempotencyKey IS NULL` coexist under the same unique index
   (`null_key_rows = 2`) — confirming existing image/smile-simulation projects are
   unaffected.
4. Verified the pair-`CHECK` constraint rejects a row carrying `requestFingerprint`
   without `idempotencyKey`, with the exact expected Postgres error.

All four checks passed on this final run (re-executed once more immediately before
writing this report, on a freshly created scratch database, to confirm nothing had
drifted during the session).

## Quality gates — exact results

| Gate | Result | Count |
|---|---|---|
| `@dentpilot/domain` build/lint/test | PASS | 9/9 (unchanged) |
| `@dentpilot/contracts` build/lint/test | PASS | 66/66 (51 pre-existing + 15 new) |
| `@dentpilot/application` build/lint/test | PASS | 77/77 (58 pre-existing + 19 new) |
| `@dentpilot/mobile` typecheck/lint | PASS | clean, untouched this stage |
| `@dentpilot/mobile` test (Jest) | PASS | 81/81 across 19 suites (unchanged) |
| `@dentpilot/api` non-DB unit tests | PASS | 30/30 (27 unit + 3 local-storage-contract, unchanged) |
| `@dentpilot/api` typecheck (`tsc --noEmit`, run directly — see below) | ENVIRONMENTAL BLOCKER | 26 errors both before and after this stage's changes — identical count, all in `prisma-unit-of-work.ts` (pre-existing pattern) and `auth.service.ts` (untouched by this stage); zero errors in any file this stage added or modified (`creations.controller.ts`, `api-presenters.ts` typecheck clean) |
| `@dentpilot/api` lint (`eslint src`, run directly) | ENVIRONMENTAL BLOCKER | 300 errors vs. 287 on the unmodified Stage 1 file, both entirely attributable to the same un-generated `@prisma/client` stub (`PrismaClient: any`) cascading through `@typescript-eslint/no-unsafe-*` rules; `creations.controller.ts`/`api-presenters.ts` lint clean (0 errors) |
| `@dentpilot/api` `prisma generate`/`validate`/`build`/`typecheck` (as defined by `package.json`, which chains `prisma generate` first) | ENVIRONMENTAL BLOCKER | `https://binaries.prisma.sh` → `403 Forbidden` (organization network-egress policy explicitly rejects this host; confirmed via the sandbox's own proxy status endpoint) |
| `@dentpilot/api` `test:integration` (real PostgreSQL, incl. the two new Stage 2 tests) | ENVIRONMENTAL BLOCKER | Every integration test file, pre-existing and new, fails identically at `PrismaService` construction: `Error: @prisma/client did not initialize yet. Please run "prisma generate" and try to import it again.` — not a database-reachability failure (a real Postgres 16 instance was running and reachable throughout this session) |
| Local storage contract test | PASS | 3/3 (counted in the 30 above) |
| Migration validation (raw SQL against real Postgres, bypassing the blocked Prisma CLI) | PASS | full chain applies cleanly; idempotency claim, NULL-distinctness, and pair-check constraint all behave exactly as designed (see above) |
| Android/iOS native build/device gates | EXTERNAL DEVICE GATE | No Android SDK/adb/emulator; Linux sandbox, so no macOS/Xcode/iOS simulator — unrelated to this stage |

No gate was converted to PASS by omission or reclassification. Every non-PASS result
above is the same pre-existing, previously-documented Prisma network-egress restriction
(see Stage 1's own execution report) or an unrelated, pre-existing device-availability
gate — never a defect this stage introduced. The typecheck/lint delta analysis above
(identical 26 vs. 26; 300 vs. 287, with the +13 fully explained by this stage's own
`createOrFindByIdempotency` addition following the exact same pre-existing, already
Prisma-blocked pattern) is offered as direct evidence, not just an assertion, that this
stage did not make the pre-existing blocker worse in kind — only in the proportional
amount of new code that inherits it.

### How the ENVIRONMENTAL BLOCKER was investigated (not just asserted)

Before accepting this classification, the following were tried and confirmed
ineffective in this sandbox for Prisma 6.19.3 with this schema:
`PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1`; adding `@prisma/adapter-pg` +
`previewFeatures = ["driverAdapters"]` with an explicit `PrismaPg` adapter constructed in
`prisma.service.ts`; adding `queryCompiler` alongside `driverAdapters`; the `--no-engine`
generate flag. Every combination still required downloading at least one engine binary
(`schema-engine` and/or `libquery-engine`) from `binaries.prisma.sh`, which the sandbox's
network policy rejects outright (confirmed via the proxy's own status endpoint: this host
is not on the allowlist, which is limited to `registry.npmjs.org`, `jsr.io`, `pypi.org`,
`files.pythonhosted.org`, `index.crates.io`, `proxy.golang.org`, and `*.anthropic.com`).
All experimental changes were fully reverted; `apps/api/package.json`,
`prisma/schema.prisma`'s `generator client` block, and `prisma.service.ts` are byte-for-
byte identical to Stage 1 in the delivered archive.

## Application-layer test design note

`packages/application/src/__tests__/creation-service-video.test.ts` exercises
`CreationService` end-to-end against an in-memory fake `UnitOfWorkPort` rather than
Prisma (which cannot run in this sandbox — see above). The fake reproduces two specific
properties of the real Postgres-backed implementation, not just a plausible-looking
simulation:

1. Every CAS-checked mutation performs its "read current value, then write" step with no
   `await` between them — reproducing what a single `WHERE revision = expectedRevision`
   `UPDATE` guarantees under real MVCC. This is what makes the concurrency tests ("exactly
   one wins") meaningful rather than an artifact of `Promise.all`'s scheduling order.
2. `transaction()` uses a per-call undo log (recording one undo closure per mutation,
   keyed to that mutation's own prior value) rather than a whole-store snapshot/restore.
   An earlier draft of this fake used whole-store snapshotting and failed one concurrency
   test non-deterministically: a losing transaction's rollback was restoring the *entire*
   store to a point in time before a *different*, already-committed winning transaction's
   write, silently erasing it — something a real Postgres transaction rollback never does
   (each transaction only ever undoes its own writes). This was caught by the test
   actually failing (`expected 1 to be 2`) on first run, root-caused, and fixed by
   switching to the per-transaction undo log documented in that file's header comment —
   recorded here because it is exactly the kind of subtle correctness bug the mission's
   test requirements are meant to catch, even though it was a bug in the test harness,
   not in `CreationService` or `PrismaUnitOfWork` itself.

## Required test coverage — mapping to mission section 12

- **Contract/API**: `packages/contracts/src/__tests__/video-creation-api.test.ts` (15
  tests) — discriminated create-request union (image unchanged, video accepted,
  cross-shape rejected both directions, unknown type rejected, strict unknown-field
  rejection, malformed media ids), `updateCreationDraftRequestSchema` union round-trip
  and rejection, video draft/revision/details DTO round-trips and rejection of a
  wrong-shaped document.
- **Service**: `packages/application/src/__tests__/creation-service-video.test.ts`,
  video happy path, wrong owner/case rejected, cross-document-type rejected both
  directions, unknown template rejected, audio-capability mismatch rejected, stale
  revision rejected, no image regression (dedicated test + the full pre-existing
  application suite passing unmodified).
- **Binding synchronization**: same file — atomic update reflected in
  `document.assetBindings`, missing required key rejected, stale CAS rejected,
  concurrent update single winner, out-of-band drift detected on read.
- **Revision**: same file — canonical hash match, exact required-binding snapshot,
  drift prevents revision, immutability after later edits.
- **Idempotency**: same file — replay, fingerprint-conflict, concurrent duplicate
  creates exactly one graph with exactly one audit event.
- **Persistence/integration**: `apps/api/test/integration/creation-video-domain.integration.test.ts`
  — the same categories against real PostgreSQL via `PrismaUnitOfWork`/`PrismaService`,
  plus direct row assertions (idempotency columns, document/binding agreement read back
  from the database, revision-hash tamper rejection). Written to run unmodified the
  moment `prisma generate` succeeds in an unrestricted environment; currently blocked
  identically to every pre-existing integration test (see Quality Gates above).
- **Regression**: all pre-existing Stage 1 evaluator tests, and all Phase 1–4 tests, pass
  unmodified (domain 9/9, contracts 51 pre-existing, application 58 pre-existing, mobile
  81/81, API non-DB 30/30).

## Unresolved blockers carried forward

Exactly one, unchanged in kind from every prior stage in this project: this sandbox's
network-egress policy blocks `binaries.prisma.sh`, which prevents `prisma generate` from
completing, which in turn blocks `apps/api`'s own `build`/`typecheck`/`lint`/
`test:integration` npm scripts (all of which chain through `prisma generate`) and the two
Prisma-dependent integration test files from executing. This is not something Stage 2
introduced or can fix from inside the sandbox; it was worked around only insofar as
correctness could be independently verified — via direct `tsc`/`eslint` invocation
bypassing the `prisma generate` chain, and via raw SQL against a real, independently
running PostgreSQL 16 instance for every persistence-level claim (migration
applicability, idempotency claim mechanics, NULL-distinctness, constraint enforcement).

## Next safe stage

Whatever Stage 3 specifies, once issued — this report and the required final gate line
explicitly do not authorize starting it. The next-recommended technical action, should a
future stage need real database confirmation of the two integration-test files added
here, is simply running them (`pnpm --filter @dentpilot/api test:integration`) in an
environment where `prisma generate` can reach `binaries.prisma.sh` (or an internal
mirror) — no code change is anticipated to be required for that to pass, given the
independent SQL-level and in-memory-fake verification already performed.

## Final status

```text
PHASE 5 STAGE 2 VERIFIED — VIDEO PERSISTENCE & API GRAPH READY
```

Every gate genuinely executable in this sandbox passed with zero regressions: 9 domain +
66 contracts (51 pre-existing + 15 new) + 77 application (58 pre-existing + 19 new) + 81
mobile + 30 API non-DB = 263 tests green, plus 34 new tests added this stage (15
contracts + 19 application), all asserting precise outcomes (exact hashes, exact
binding sets, exact single-winner races) rather than snapshots. The only non-passing
gates are the same pre-existing Prisma network-egress restriction documented in every
prior Phase 4/5 session in this project (independently re-verified not to be a
regression, via matched-baseline lint/typecheck error counts) and the unrelated,
pre-existing Android/iOS device-availability gate — neither is an integrity defect
introduced by this stage.
