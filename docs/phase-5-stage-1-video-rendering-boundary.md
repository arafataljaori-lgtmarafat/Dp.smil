# Phase 5 / Stage 1 — Video Rendering Boundary

Defines the responsibility split between composition semantics (this codebase, today)
and rendering implementation (platform adapters, not built yet). No encoder technology
is bound at the domain/application level anywhere in this stage.

## The four responsibilities

### 1. Evaluator — "what should exist at time T"

`evaluateVideoCompositionAtTime` (`packages/application/src/video-composition-engine.ts`).
Pure, deterministic, platform-agnostic. Input: a validated document, its matching
template, a set of private render assets, an integer `timeMs`, and a target canvas size.
Output: an immutable `VideoRenderPlanAtTime` — a flat, ordered list of draw commands
(`background` / `image` / `text`, each carrying an `opacity`) plus the resolved canvas
and style token. This is the **only** place timeline, motion, and transition logic
exists. It has zero knowledge of Skia, FFmpeg, AVFoundation, MediaCodec, React, React
Native, or any backend service.

### 2. Preview — "how to draw one frame live"

`VideoFramePresenterPort` (`packages/application/src/ports.ts`), **interface only, no
implementation in this stage**. A future native adapter (the natural home is alongside
`native-composition-preview.native.tsx`, which already renders the image `RenderPlan`
via Skia) would call the evaluator once per animation-frame tick with the current
playhead `timeMs`, and hand the resulting plan to this port. The port's contract
explicitly forbids the adapter from owning its own time-stepping or composition logic —
it only draws what it's given.

### 3. Export — "how to encode the whole thing"

`VideoExportRendererPort` (`packages/application/src/ports.ts`), **interface only, no
implementation in this stage**. A future adapter — native-local (mirroring
`composition-offscreen-export.native.ts`'s pattern) or backend-rendered — would sample
the evaluator at its own chosen frame rate (derived from `renderProfile.profileKey`,
never from the document itself) across `[0, document.durationMs]` and encode the
sampled frames into an output artifact. No encoder is named, imported, or assumed at
this interface level; `exportComposition`'s return shape (`outputUri`, `durationMs`) is
deliberately encoder-agnostic.

### 4. Persistence and identity — deliberately out of scope this stage

`canonicalVideoExportRequestPayload` (`video-export-identity.ts`) defines what a
coalescible export request looks like, but nothing calls it yet: there is no
`VideoExportJob` Prisma model, no queue, no controller endpoint. Section 10 of the
Stage 1 command explicitly warns against reusing `GenerationJob` "blindly" for this —
having now audited it (Phase 5 Stage 0), `GenerationJob` encodes AI-provider provenance
(`providerKey`, `providerVersion`) that has no meaning for a deterministic local/backend
render. A future `VideoExportJob`/`VideoExportVersion` pair should mirror
`GenerationJob`/`GenerationVersion`'s *shape* (owner-scoped, idempotent-by-fingerprint,
immutable output row) without inheriting its AI-specific fields — proposed, not
implemented, and explicitly deferred to the roadmap.

## Why the split matters

- **Preview and export share one source of truth.** A 60fps live preview and a 30fps
  final export sampling the same document produce visually consistent results because
  both call the identical pure function — there is no second, drifting implementation of
  "what a crossfade at 62% progress looks like."
- **No vendor lock-in at the domain level.** Switching the native preview renderer, or
  adding a backend export path, never requires touching `video-composition-engine.ts`,
  `video-composition.ts`, or `video-templates.ts` — only a new adapter implementing the
  same two ports.
- **Testability without a device.** Every timeline/transition/determinism test in this
  stage runs in plain Node (`vitest`), with zero Android/iOS/Skia/encoder dependency,
  because the evaluator itself has none.

## What a future adapter must uphold (not yet enforced, because none exists)

- Exactly-once resource acquisition/release per rendered asset, with release on partial
  failure — the same discipline already proven in
  `apps/mobile/src/creation/protected-export-source.ts` and its Phase 4 test suite
  (`phase4-closure-authoritative-export.test.ts`).
- Never call the evaluator with a mutated copy of a previous plan's inputs — always pass
  the canonical document/template/assets for the current `timeMs`, letting the evaluator
  itself compute the frame from scratch (this is what makes it safe to skip frames,
  seek, or scrub without accumulating drift).
- Respect the resource bounds recorded for this stage (see the execution report) when
  choosing how many frames to buffer, cache, or pre-render.
