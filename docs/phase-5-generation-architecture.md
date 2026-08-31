# Phase 5 / Stage 0 — Generation Architecture Audit &amp; Production State Machine

Decision-gate documentation only. No code in this repository was changed to produce this
document. Read directly from the validated Stage 2 codebase
(`DentPilot_Phase_4_Stage_2_Native_Validation_Claude.zip`, SHA-256
`69ce98a7b5a8427c5420d6a46c29c3e6920f45cafcf7d3f80b9553cc581f813f`).

## 1. What already exists (audited directly from source)

### Domain layer — `packages/domain/src/generation.ts`
- `GenerationStatus`: `queued | processing | succeeded | failed | cancelled`, with an
  explicit transition table (`queued→processing|cancelled`, `processing→succeeded|failed`,
  all terminal states have no outbound transitions) enforced by
  `assertGenerationTransition`.
- `GenerationProvenance` + `assertCompleteProvenance`: every generated asset must carry
  `sourceMediaId`, a validated 64-hex-char `sourceSha256`, `generationJobId`,
  `providerKey`, `providerVersion`, `generationContractVersion`, and a parameters map —
  enforced before any output is considered valid.
- `assertIdempotencyKey`: 8–160 visible, non-whitespace characters.
- `GenerationFailureCode`: `SOURCE_NOT_FOUND | SOURCE_INTEGRITY_MISMATCH | PROVIDER_FAILED
  | OUTPUT_INVALID | STORAGE_READ_FAILED | STORAGE_WRITE_FAILED | PERSISTENCE_FAILED |
  INTERNAL_FAILURE` (from `packages/domain/src/errors.ts`).

### Application layer — `packages/application/src/generation-service.ts` + `ports.ts`
- `GenerationService.request()`: resolves the project + source media for the
  authenticated owner, computes a canonical request fingerprint (owner, contract version,
  generation type, project, provider key, source media id + sha256), and calls
  `generations.createOrFindByIdempotency()` inside a transaction. A idempotency-key reuse
  with a **different** fingerprint raises `IdempotencyConflictError`. On first creation, an
  audit event (`GenerationRequested`) is appended in the **same transaction**, and the job
  is enqueued only after the transaction commits.
- `GenerationService.process()` (the worker path): re-validates the queue message belongs
  to the claiming tenant, atomically claims the job (`claimForProcessing`, transactional,
  appends `GenerationStarted`), re-reads the source media, **re-verifies its SHA-256
  against the immutable record before calling the provider** (rejects if the stored bytes
  no longer match — `SourceIntegrityMismatchError`), calls the provider port, validates the
  provider's output (non-empty bytes, positive dimensions, `image/png` mime type
  hard-coded, non-empty `providerVersion`), writes the output to private storage,
  re-asserts provenance, and — in one final transaction — creates the `MediaAsset`,
  asserts generated-asset provenance, creates the immutable `GenerationVersion`, appends
  `GenerationSucceeded`, and marks the job `complete`. Any failure at any stage deletes the
  written storage object (best-effort) and transitions the job to `failed` with a specific
  `GenerationFailureCode`, appending `GenerationFailed`.
- **The provider boundary is already provider-neutral.** `SmileSimulationProviderPort`
  is `{ key: string; generate(input): Promise<output> }` — plain bytes in, plain bytes +
  metadata out. Nothing in the domain or application layer knows anything about a
  specific vendor. This is exactly the boundary Stage 0's mission requires
  (`Mobile → DentPilot API → generation service → provider-neutral adapter → private
  storage → immutable GenerationVersion`), and it already exists, unmodified, today.

### Infrastructure layer — `apps/api/src`
- `infrastructure/media/mock-smile-simulation.provider.ts`: the only implementation of
  `SmileSimulationProviderPort` in the repository. Deterministically renders a labeled
  placeholder card (`"MOCK OUTPUT" / "NOT A CLINICAL SIMULATION" / "NO DIAGNOSIS · NO
  TREATMENT PLAN · NO PREDICTION"`) via `sharp`. It does not call any external service.
  This already encodes the correct safety posture at the placeholder level.
- `infrastructure/queue/in-memory-generation-queue.adapter.ts`: **explicitly documented
  in its own source comment as "Development-only, non-durable queue adapter."**
  Implementation is a `setTimeout`-based in-process callback — no persistence, no
  cross-process delivery, no retry, no backoff, no dead-letter path. It carries no media
  bytes or secrets (a correct, narrow safety property), but it does not survive an API
  process restart.
- `modules/generation-queue.bootstrap.ts`: wires the in-memory queue's executor at
  startup. This is a wiring point for a durable queue, not a reconciler — it does not
  scan for stale/orphaned jobs.
- `controllers/generations.controller.ts`: exactly two endpoints —
  `POST /projects/:projectId/generations` (idempotent request) and
  `GET /generations/:generationJobId` (poll job + latest version). No cancel endpoint,
  no webhook/callback endpoint.
- `prisma/schema.prisma` — `GenerationJob`/`GenerationVersion` models: owner-scoped
  throughout (`ownerUserId` on every row, every foreign key composite-scoped by
  `ownerUserId`), `@@unique([ownerUserId, projectId, idempotencyKey])` for idempotency,
  `@@unique([generationJobId, versionNumber])` for version immutability, `onDelete:
  Restrict` everywhere (no cascading deletes that could silently destroy provenance).
  Confirmed unchanged at 13 migrations.
- `packages/application/src/object-storage-keys.ts` + `ObjectStoragePort`: server-owned,
  regex-validated storage keys (`users/{uuid}/cases/{uuid}/generated/{uuid}`); the port
  has **no presigned-URL method at all** — every byte flows through the API process. This
  is the strongest possible reading of "mobile must never hold provider secrets" and
  extends naturally to "the provider never gets a client-facing URL either," but it does
  mean a provider that wants to fetch a source image itself (rather than receiving bytes
  in a request body) cannot be wired in without an additive change (see §3).

## 2. Reuse decision

**No blocker was found that requires redesigning the audited boundary.** The
request/idempotency/queue/claim/provenance/immutable-version flow, the owner-scoped
persistence model, and the provider-neutral port are all sound and directly reusable for
a real provider. Rule 1's instruction — "reuse it, redesign only if you prove a blocker"
— is satisfied by reuse; nothing below requires touching `GenerationService`,
`generation.ts`, or the Prisma schema's existing shape.

## 3. Concrete gaps (additive work for a future Stage 1, not evidence of a blocker)

These are real, evidenced absences — not speculation — each with its exact source
location. None of them require Stage 0 implementation; they define the shape of a future
Stage 1 scope (§5) and the failure model below.

| Gap | Evidence | Why it matters for a real provider |
|---|---|---|
| No durable queue | `in-memory-generation-queue.adapter.ts` docstring; `setTimeout`-based | A real provider call can take seconds to tens of seconds (see cost/latency doc). A process restart mid-flight silently strands `processing` jobs forever — there is no reconciler to find them. |
| No cancellation implementation | Domain models `queued→cancelled`; **zero** occurrences of a `cancel` method across `GenerationRepositoryPort`, `GenerationService`, or `GenerationsController` | The state machine already anticipates cancellation but nothing implements it end-to-end. |
| No stale/timeout reconciliation | No `generation`-named reconciler/bootstrap file exists (contrast with the media-upload subsystem, which has `media-upload-recovery.bootstrap.ts` and a documented processing-timeout/orphan-cleanup design in Phase 3) | A job stuck in `processing` (crashed worker, provider hang) has no path back to `failed` or retry today. |
| No webhook/callback ingestion | Zero webhook routes anywhere in `apps/api/src` | Real async providers (queued generation, longer-running edits) commonly notify via webhook rather than a held-open request. The current architecture assumes a provider call that returns synchronously within the worker's own execution. |
| No retry policy for transient provider failures | `PROVIDER_FAILED` goes straight to `failed`, one attempt, no backoff | A transient 429/5xx from a real provider currently costs the user a full failed job with no automatic recovery. |
| Output mime type hard-coded to `image/png` | `generation-service.ts` line ~243: `providerOutput.mimeType !== 'image/png'` throws `OUTPUT_INVALID` | A provider returning JPEG (several candidates do, or offer it as an option) would need this widened — narrow, low-risk, but a real code change, not zero-touch. |
| No presigned/signed URL capability on `ObjectStoragePort` | Interface has `putStream/getStream/head/delete/probeReadiness` only | If a chosen provider requires fetching the source itself rather than accepting bytes in-request, this port needs an additive method — see the threat model for the security implications of that path specifically. |

## 4. Production state machine (definition, not implementation)

The existing domain transition table is correct as far as it goes and should be
**extended, not replaced**:

```text
queued
  → processing            (worker claims; existing, atomic via claimForProcessing)
  → cancelled              (existing transition, not yet reachable via any code path)

processing
  → succeeded               (existing)
  → failed                  (existing)
  → processing (retry N)   [NEW — bounded, see below]
  → failed (timeout)        [NEW — via reconciliation, see below]

succeeded, failed, cancelled: terminal (existing, unchanged)
```

Required additions for a production system, all additive to the existing enum/transition
shape (no existing state removed or renamed):

- **Retries**: a bounded retry count (proposed: max 3 attempts) for `PROVIDER_FAILED` and
  `STORAGE_WRITE_FAILED` only — never for `SOURCE_INTEGRITY_MISMATCH` or `OUTPUT_INVALID`,
  which indicate the input or the provider's response is invalid, not transient. Retries
  reuse the existing idempotency key; the job stays in `processing` across attempts. Cap
  and backoff (proposed: exponential, capped, jittered) are policy to be decided in Stage
  1, not Stage 0.
- **Timeout**: a `processingTimeoutSeconds` per job (mirrors the Phase 3 upload-session
  pattern's `created`-expiry-vs-processing-timeout split), enforced by a new recurring
  reconciler (mirrors `media-upload-recovery.bootstrap.ts`) that finds jobs stuck in
  `processing` past their timeout and transitions them to `failed` with a new
  `PROCESSING_TIMEOUT` failure code, freeing the idempotency key's terminal state for the
  user to see and retry deliberately.
- **Cancellation**: `queued → cancelled` (before a worker claims it) is straightforward —
  add a `cancel()` repository method with the same ownership + status-guard pattern as
  `complete`/`fail`. `processing → cancelled` (mid-flight) is materially harder if the
  provider call is already in flight against a real external API (the provider may still
  bill for it, and a stale response arriving after cancellation must not resurrect the
  job) — this needs its own explicit design in Stage 1, not an assumption here.
- **Stale callbacks** (only relevant if a webhook-based provider is chosen): any webhook
  handler must re-validate the job is still in the exact state it expects
  (`processing`, matching `correlationId`) before acting — exactly the same discipline
  `process()` already applies when re-checking `jobBeforeClaim.correlationId !==
  message.correlationId` for queue messages. A late/duplicate webhook for an
  already-`succeeded` or already-`failed` job must be a safe no-op, not a second write.
- **Lost-success recovery**: if the API process crashes after the provider call succeeds
  but before the final transaction commits, the provider was still charged and the
  generated bytes may exist at the provider or in a partial storage write. The bounded
  retry path must not re-call the provider a second time for the same attempt purely
  because the local transaction didn't finish — this requires either (a) an idempotency
  key passed *to the provider itself* where the provider supports one (verify per
  candidate in the benchmark), or (b) a durable "provider call already issued" marker
  written before the call so a resumed worker checks that marker before re-issuing.
  Neither exists today; this is a genuine open design question for Stage 1, not
  something Stage 0 can resolve by documentation alone.
- **Provider outage**: with a durable queue and bounded retry in place, a full-provider
  outage should surface as a run of `PROVIDER_FAILED` jobs after exhausting retries, not
  as silently stuck `processing` jobs — the timeout reconciler is the backstop if retries
  themselves can't observe the outage cleanly (e.g., the provider's connection hangs
  rather than erroring).
- **Concurrency**: already correctly handled for the existing flow — `claimForProcessing`
  is atomic and owner-scoped, and duplicate queue messages for an already-claimed job are
  no-ops (`process()` returns early if `claimed` is false). This property must be
  preserved by any new retry/timeout/webhook logic, not weakened.

## 5. Smallest defensible Phase 5 Stage 1 scope (defined, not started)

If the decision document's outcome is READY, the smallest Stage 1 slice that turns this
into a real, safely-operable feature — in dependency order, additive-only to the audited
architecture:

1. Durable queue swap-in behind the existing `GenerationQueuePort` interface (no
   application/domain change required — the port is already an abstraction boundary).
2. `PROCESSING_TIMEOUT` failure code + a generation reconciler mirroring the Phase 3
   upload-session recovery pattern.
3. Bounded retry (attempt count + backoff policy) for the two genuinely-transient failure
   codes only.
4. `cancel()` for the `queued` state only (defer mid-flight cancellation to a follow-up
   slice once a real provider's cancellation/billing semantics are known).
5. One concrete provider adapter implementing `SmileSimulationProviderPort`, selected
   from the controlled benchmark this Stage 0 recommends running before that adapter is
   written — **not before**.
6. Widen the output mime-type assertion if the selected provider's native output isn't
   PNG.

Explicitly **not** in this smallest scope: webhook ingestion (only add if the selected
provider is genuinely async/webhook-based — a synchronous-response provider doesn't need
it), presigned-URL storage access (only add if the selected provider requires fetching
the source itself), mid-flight cancellation, multi-provider fallback/routing, and any UI
change beyond what's needed to surface the new failure/cancel states that already exist
in the domain enum.
