# Phase 5 / Stage 3 — Change Map

Status: approved plan; implementation starts at Gate G1.

## Scope guardrails

- `evaluateVideoCompositionAtTime` remains the sole source of timeline, motion, transition, and temporal semantics.
- The authenticated Stage 2 media graph's persisted `width` and `height` are the evaluator dimensions. Native decoding may validate those values only.
- No Prisma schema, migration, Stage 2 persistence/idempotency/revision behavior, export/encoder, or AI work is in scope.
- The existing `before_after_image` editor and protected preview-cache behavior are compatibility boundaries.

## Gate map

### G1 — playback runtime and deterministic fakes

Add `apps/mobile/src/creation/video-preview-runtime.ts` and
`apps/mobile/src/creation/video-preview-errors.ts`, with
`apps/mobile/__tests__/video-preview-runtime.test.ts`. The runtime owns only an
integer-millisecond playhead, monotonic-clock sampling, cancellable frame scheduling,
and explicit Play/Pause/Seek/Scrub/Replay transitions. It does not interpret a template
or calculate visual motion.

### G2 — evaluator integration

Add a typed evaluator-facing bridge and tests. Every frame is evaluated from canonical
document/template/assets/playhead inputs through `evaluateVideoCompositionAtTime`.

### G3 — protected video media session

Add a video-specific media acquisition/session layer, composing (not changing)
`protected-preview-cache.ts`. It deduplicates by account-scoped `mediaId`, validates
decoded dimensions against persisted metadata, bounds lifecycle ownership, and exposes
typed failures.

### G4 — native Skia video adapter

Add native/web video-preview adapters. The native adapter consumes only evaluated video
plans and honors command opacity; it contains no timeline or template logic.

### G5 — persisted creation route

Modify only the smallest persisted-type route/API parsing boundary needed to dispatch a
`before_after_video` creation into its preview. `before_after_image` remains on the
existing path. No creation-flow expansion is planned.

### G6 — lifecycle, race, and error closure

Add AppState, unmount, stale-session, acquisition cancellation, and typed-error handling
with deterministic tests.

### G7 — full regression

Run lint, type checks, application/contracts tests, and the full mobile suite. No gate
advances on a failure.

### G8 — Android native validation

Run the Android native runtime and record device/emulator, measured playback behavior,
memory/resource observations, and limitations in a validation report. Stage 3 cannot be
declared VERIFIED without this gate.

## Expected file boundaries

New runtime/media/adapter/test files will be added under
`apps/mobile/src/creation` and `apps/mobile/__tests__`. Existing modifications are
expected only in the mobile API parsing boundary, creation detail route dispatcher, Jest
setup if native mocks require it, and Stage 3 validation documentation. Changes to
`apps/mobile/app/cases/[caseId].tsx`, `protected-preview-cache.ts`, and native app
configuration require additional repository evidence and are not approved by this map.
