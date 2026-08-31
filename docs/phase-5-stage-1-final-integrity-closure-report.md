# Phase 5 / Stage 1 — Final Integrity Micro-Closure Report

Narrow integrity closure of the Stage 1 case-to-video foundation, performed against
`DentPilot_Phase_5_Stage_1_Case_to_Video_Foundation_Claude.zip`
(SHA-256 `58b74d1423f2fca5ab5c9fcd792eac2bcca9c1f36c7c02a4772ce266df51f3ee`, confirmed by
content-level diff against the working tree — the outer ZIP hash differs on a fresh
re-zip purely from non-deterministic archive metadata; `diff -rq` on the extracted
contents of both archives reports zero differences). No architectural redesign was
performed; every change below is a targeted fix to a specific, re-audited defect.

## Defects re-audited and confirmed, then fixed

### 1. Render-asset identity did not verify against the document binding

**Confirmed real** by direct code inspection: the binding-presence check in
`evaluateVideoCompositionAtTime` verified an asset existed for each required binding key
and that the document declared a binding for that key, but never compared
`asset.mediaId` against `document.assetBindings[key].mediaId`. Fixed by adding that
exact equality check, throwing `VideoCompositionEvaluationError` on mismatch before any
render command is built. Tests added: before-binding mismatch throws, after-binding
mismatch throws, and the valid (matching) path is confirmed not to throw.

### 2. Template audio capability was not enforced

**Confirmed real**: `resolveVideoTemplateForDocument` checked template-reference,
aspect-ratio, style, and duration agreement, but never checked `document.audioRef`
against `template.audio.acceptsAudioReference`. Fixed by adding that check to
`resolveVideoTemplateForDocument` (rejecting before evaluation, not silently ignoring).
Tests added: null `audioRef` against a non-accepting template is accepted; non-null
`audioRef` against a non-accepting template is rejected; non-null `audioRef` against an
accepting template is accepted; a full `evaluateVideoCompositionAtTime` call is
confirmed to reject before emitting any render command. Audio playback remains
unimplemented, exactly as instructed.

### 3. Reveal/splitReveal wipe clip used the outgoing segment's geometry, not the incoming segment's

**Confirmed real**, and confirmed harmless-until-now: the wipe clip was computed from
`active.segment.slotRect` (the outgoing segment) rather than the incoming segment being
revealed. Every existing fixture (the reference `classic-reveal` template and the prior
test suite's `wipeTemplate`) happened to give both segments identical slot rectangles,
so the bug produced correct output by coincidence and no existing test caught it. Fixed
by deriving the wipe clip from `incoming.segment.slotRect` instead. Added a regression
test with deliberately different outgoing (left half of canvas) and incoming (right half
of canvas) slot rectangles, asserting the incoming image's clip lands at the incoming
segment's own geometry (`x≈500`) rather than the outgoing segment's (`x≈0`) — this test
fails against the pre-fix code and passes against the fix. Crossfade semantics were not
touched (crossfade never used a clip override at all).

### 4. Template-level timing was unbounded relative to the document's own bounds

**Confirmed real**: `validateVideoTemplateDefinition` bounded each segment's own
duration and the transition-vs-segment relationship, but never checked that a
template's *total* duration (sum of segment durations) falls within
`[MIN_VIDEO_DURATION_MS, MAX_VIDEO_DURATION_MS]` — the same bounds
`VideoCompositionDocumentV1.durationMs` itself enforces — nor that overlay visibility
windows stay within that total duration. A template could therefore validate
successfully at the template layer while being permanently unusable at the document
layer (every resolution would fail the duration-equality check). Fixed by importing
`MIN_VIDEO_DURATION_MS`/`MAX_VIDEO_DURATION_MS` from `video-composition.ts` into
`video-templates.ts` (one authoritative source, per the instruction not to create
divergent magic numbers — verified as a safe, one-directional, non-circular import) and
adding: a total-duration bounds check, an "overlay must not start at/after the total
duration" check, and an "overlay must not end after the total duration" check. Tests
added: total duration too long, total duration too short, overlay starting at/after the
end, overlay ending after the end, and an explicit boundary-acceptance test for an
overlay whose `visibleToMs` lands exactly on the total duration.

### 5. Accidental public API expansion

**Confirmed real** by grep across the entire repository: `restrictedTextSchema`,
`normalizedTransformSchema`, and the `NormalizedTransform` type — all promoted from
private `const`s to public exports during Stage 1 — had zero consumers anywhere outside
their own declaration in `packages/contracts/src/index.ts`. The new video contract files
each declared their own local equivalents instead of importing the promoted ones.
Reverted all three to their exact pre-Stage-1 private form (verified against the
original file content). `docs/phase-5-stage-1-execution-report.md`'s changed-file
description was corrected to match.

## Full clean-state regression results

Every command run after `find . -name "*.tsbuildinfo" -not -path "*/node_modules/*"
-delete` and removing `packages/{domain,contracts,application}/dist` and
`apps/mobile/dist`, rebuilt in dependency order (domain → contracts → application →
mobile), exactly matching the discipline established across every prior session in this
project.

| Gate | Result | Count |
|---|---|---|
| `@dentpilot/domain` lint/build/typecheck/test | PASS | 9/9 (unchanged) |
| `@dentpilot/contracts` lint/build/typecheck/test | PASS | **51/51** (46 pre-closure + 5 new) |
| `@dentpilot/application` lint/build/typecheck/test | PASS | **58/58** (50 pre-closure + 8 new) |
| `@dentpilot/mobile` lint/typecheck | PASS | — |
| `@dentpilot/mobile` test (Jest) | PASS | 81/81 across 19 suites (unchanged) |
| `@dentpilot/api` non-DB unit tests | PASS | 27/27 (unchanged) |
| `@dentpilot/api` local storage contract test | PASS | 3/3 (unchanged) |
| `@dentpilot/api` lint | ENVIRONMENTAL BLOCKER | 566 errors — same Prisma-stub cascade as every prior session; `apps/api` was not touched by this closure |
| `@dentpilot/api` migrate/validate/integration | ENVIRONMENTAL BLOCKER | `binaries.prisma.sh` → `403`, unchanged |
| Android/iOS native/device gates | UNAVAILABLE — EXTERNAL DEVICE GATE | unchanged from every prior session's preflight |

**New/modified tests this closure: 13** (5 in `packages/contracts/src/__tests__/video-templates.test.ts`,
8 in `packages/application/src/__tests__/video-composition-engine.test.ts`). No existing
test was deleted or weakened; two of my own test-fixture arithmetic slips (unrelated to
the five defects) were caught by the tests failing honestly on first run and corrected
before this report was written — recorded here for the same transparency reason the
original Stage 1 report recorded its own.

**Cumulative total, pre-existing + all Stage 1 + this closure:** 156 pre-existing
(9 domain + 17 contracts + 19 application + 81 mobile + 27 API non-DB + 3 storage) +
73 new since Stage 1 began (34 contracts + 39 application) = **229 tests, all green.**

## Exact changed-file list (this closure only)

- `packages/application/src/video-composition-engine.ts` — three targeted fixes (asset
  identity check, audio capability check, incoming-segment wipe geometry); no
  unrelated line changed.
- `packages/contracts/src/video-templates.ts` — one new import, three new validation
  checks (total duration bounds, overlay-start bound, overlay-end bound) appended to
  the existing `validateVideoTemplateDefinition` function; no unrelated line changed.
- `packages/contracts/src/index.ts` — reverted the three accidental public exports to
  their exact pre-Stage-1 private form.
- `packages/application/src/__tests__/video-composition-engine.test.ts` — 8 new tests.
- `packages/contracts/src/__tests__/video-templates.test.ts` — 5 new tests.
- `docs/phase-5-stage-1-execution-report.md` — corrected changed-file description for
  `packages/contracts/src/index.ts`.
- `docs/phase-5-stage-1-final-integrity-closure-report.md` — this file.

No file outside this list was touched. No file under `apps/api`, `apps/mobile/src`,
`apps/mobile/app`, `packages/domain`, `packages/application/src/composition-engine.ts`,
`packages/application/src/template-catalog.ts`,
`packages/application/src/creation-service.ts`, `packages/application/src/ports.ts`, or
any pre-existing documentation file (other than the one correction above) was modified.

## Migrations

None. Unaffected by this closure — the defects fixed were all in-memory
contract/evaluator logic, not persistence.

## Unresolved blockers

None introduced by this closure. The same three pre-existing environmental limits from
every prior session remain: Prisma network egress (`binaries.prisma.sh` → `403`), no
Docker (blocking MinIO-dependent gates), and no Android/iOS SDK or device (blocking
native/device gates). None is a defect in this codebase.

## Final status

```text
PHASE 5 STAGE 1 FINAL INTEGRITY VERIFIED — READY FOR STAGE 2
```

All five claimed boundary defects were independently re-verified against the actual
source before any fix was written, confirmed genuine, fixed narrowly, and covered by
precise (non-snapshot) regression tests that fail against the pre-fix code and pass
against the fix. Every pre-existing test remains green. Stage 2 was not started.
