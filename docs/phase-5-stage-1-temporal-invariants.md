# Phase 5 / Stage 1 — Temporal, Ownership, Idempotency & Integrity Invariants

Every invariant below is enforced today, in code delivered this stage, and covered by a
passing test in `packages/contracts/src/__tests__/video-composition.test.ts`,
`packages/contracts/src/__tests__/video-templates.test.ts`, or
`packages/application/src/__tests__/video-composition-engine.test.ts` unless explicitly
marked "future" (designed/documented now, not yet enforced because nothing persists or
calls it yet).

## Time base

- All durations and offsets are non-negative, finite **integer milliseconds**. No field
  in the contract or evaluator ever carries a floating-point time value.
- FPS is never stored in `VideoCompositionDocumentV1`. It is resolved from
  `renderProfile.profileKey` by whichever adapter (preview or export) is sampling the
  evaluator — the same composition drives both at whatever rate each is capable of.

## Segment boundary semantics (exact, no ambiguity)

- Segments tile `[0, document.durationMs]` contiguously: segment 0 starts at 0, each
  subsequent segment starts exactly where the previous one ends, and the last segment's
  end equals `document.durationMs` exactly.
- Each segment's own interval is **half-open**: `[startMs, endMs)`. A query at exactly
  `endMs` belongs to the *next* segment, not this one.
- The single exception is the document's own final instant: `timeMs === durationMs` maps
  onto the **last** segment, evaluated at its own full local duration (i.e., its own
  final instant) — there is no segment whose half-open interval would otherwise include
  that exact value, so this one boundary is defined explicitly rather than left
  ambiguous. Test: `evaluates the final document instant as the last segment at its own
  full local duration`.
- Any `timeMs < 0` or `timeMs > durationMs` is rejected (`VideoCompositionEvaluationError`),
  never silently clamped. Any non-integer `timeMs` is rejected. Rationale: a pure
  evaluator should fail loudly on a malformed caller query rather than mask a bug in the
  frame-stepping/export-sampling loop above it.

## Transition boundary semantics (exact, no ambiguity)

- A transition is declared as attached to the segment it **follows**
  (`afterSegmentId`), and its window is entirely contained within that segment's own
  tail: `[segment.endMs - transition.durationMs, segment.endMs)`. It never extends into
  or depends on the successor segment's own interval — the successor is evaluated
  independently, always starting fresh at its own local time 0 once its own interval
  begins.
- `transition.durationMs` can never exceed the segment's own `defaultDurationMs` —
  enforced at template-validation time (`validateVideoTemplateDefinition`), not just at
  evaluation time.
- The final segment in a template may never have an outgoing transition — enforced at
  template-validation time.
- Within the transition window, progress is computed as
  `(localTimeMs - windowStart) / transition.durationMs`, clamped to `[0, 1]`. At
  `progress = 0` the incoming content is fully unrevealed; at `progress` approaching `1`
  (the window's own exclusive end) the incoming content is fully revealed. The
  transition never reaches `progress === 1` inside its own segment's interval by
  construction (half-open), and the successor segment picks up at full visibility the
  instant its own interval begins — there is no visible seam or double-counted frame.

## Determinism

- `evaluateVideoCompositionAtTime` is a pure function: same `(document, template,
  assets, timeMs, target)` always produces a deep-equal `VideoRenderPlanAtTime`. It
  performs no I/O, reads no system clock, uses no random source, and mutates none of its
  inputs (asserted directly in a test that snapshots inputs before and after
  evaluation).
- Easing (`applyEasing`) is a small, closed table (`linear`, `easeInOutCubic`) of pure
  math functions. Adding an easing requires adding it to both the contract's
  `easingKeys` and the evaluator's `applyEasing` — there is no dynamic/interpreted
  easing, and no user-supplied code path exists anywhere in the motion system.
- No command in any evaluated plan is ever `NaN` or `Infinity` — asserted by iterating
  every 137ms across a full reference-template timeline and checking every numeric field
  of every command.

## Ownership and cross-account isolation

- The video contract's asset bindings reuse the exact same `'before'`/`'after'`
  binding-key vocabulary and the exact same owner-scoped `MediaAsset` model as the image
  flow — no new binding-key enum, no new media-asset model, no relaxation of the
  existing `ownerUserId`-scoped composite foreign keys anywhere in the schema.
- Every render asset passed into the evaluator must use a private source URI
  (`file://` or `dentpilot-private://`) — a public/HTTP source is rejected before any
  geometry math runs, exactly mirroring the existing image `createRenderPlan`'s check.

## Idempotency and provenance (future — designed, not yet wired)

- `canonicalVideoExportRequestPayload` (`video-export-identity.ts`) defines a stable,
  key-order-independent canonical JSON representation of an export request, built from
  immutable inputs only: owner, project, the **immutable revision id** (not the mutable
  draft), the document's own content hash, template identity, bound asset content
  hashes, the render-profile key, and a `rendererContractVersion` integer bumped
  whenever the evaluator's observable behavior changes.
- Two logically identical export requests canonicalize identically regardless of
  object-key insertion order (mirrors the existing `canonicalizeCreationDocument`/
  `canonicalizeVideoCompositionDocument` pattern) and are therefore coalescible/
  idempotent by construction once a caller hashes this payload — exactly the discipline
  `GenerationService.request()` already uses.
- **Not yet true**, because nothing persists an export request yet: no `VideoExportJob`
  Prisma model, no queue, no controller. This is a designed invariant a future
  persistence layer must uphold, not a currently-enforced one.

## Resource ownership (future — designed now, enforced when adapters exist)

- The rendering-boundary ports (`VideoFramePresenterPort`, `VideoExportRendererPort`)
  are declared with the explicit expectation, documented in
  `phase-5-stage-1-video-rendering-boundary.md`, that any concrete adapter reuses
  Phase 4's acquire-once/release-exactly-once resource pattern
  (`protected-export-source.ts`'s `finally`-block release discipline) — no adapter
  exists yet to violate or uphold this, so it is recorded here as a binding requirement
  for whoever writes the first one.

## Backward compatibility

- `CreationDocumentV1`'s schema, exports, and all 10 pre-existing tests are byte-for-byte
  unchanged. The only contracts-package change touching pre-existing code is the
  promotion of one private `const` (`normalizedTransformSchema`) to a public export —
  additive, non-breaking, covered by the unchanged passing suite.
- The existing image `composition-engine.ts`, `template-catalog.ts`, and
  `creation-service.ts` were not modified. All 19 pre-existing application-package tests
  and all 81 pre-existing mobile tests pass unchanged.
