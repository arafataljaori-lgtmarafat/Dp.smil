# Phase 5 / Stage 1 — Case-to-Video Architecture

Architectural-foundation documentation for the Before/After video composition system.
Companion documents: `phase-5-stage-1-temporal-invariants.md` (the full invariant list),
`phase-5-stage-1-video-rendering-boundary.md` (evaluator vs. renderer responsibilities),
`phase-5-stage-1-execution-report.md` (what was actually run and verified),
`phase-5-roadmap-after-architectural-rebase.md` (what comes next).

## Current-state map (audited before any code was written)

- `CreationProjectType` (Prisma enum, `apps/api/prisma/schema.prisma`) and
  `projectSchema.type` (`packages/contracts/src/index.ts`) **already include**
  `before_after_video` alongside `smile_simulation` and `before_after_image`. No enum
  migration was needed.
- `CreationDraft.document` and `CreationRevision.document` are Prisma `Json` columns with
  a separate `schemaVersion`/`documentSchemaVersion` integer column. The relational graph
  does not care what shape the JSON is — routing by `CreationProject.type` plus the
  document's own `schemaVersion` is already the established pattern. **No Prisma
  migration was needed for this stage** (Section 15's audit requirement, confirmed).
- `CreationAssetBinding.bindingKey` and `CreationRevisionAsset.bindingKey` are plain
  `String` columns, not a Prisma enum — the existing `'before'`/`'after'` binding-key
  vocabulary is already reusable for video without a schema change.
- `packages/application/src/creation-service.ts` currently hard-codes
  `type: 'before_after_image'` at creation time and filters/guards on that literal
  throughout. It does **not** yet route or persist `before_after_video` projects — that
  wiring is explicitly deferred (see the roadmap doc), consistent with this stage's
  charter of building the contract/evaluator/boundary layer only.
- `packages/application/src/composition-engine.ts` is the reference pattern this stage
  follows and reuses directly: pure functions, `.strict()` Zod schemas, a normalized
  `[0,1]` coordinate system mapped to pixel canvases via `resolveRenderCanvas`, and an
  immutable `RenderPlan` output. The new video evaluator imports and reuses
  `resolveRenderCanvas`, `normalizedRectToPixels`, `resolveImagePlacement`, and
  `aspectRatioValue` from this file rather than duplicating the geometry math.
- `GenerationJob`/`GenerationVersion` (audited in Phase 5 Stage 0,
  `docs/phase-5-generation-architecture.md`) encode AI-generation provenance
  (`providerKey`, `providerVersion`) and are **not** reused for video export identity —
  see `video-export-identity.ts` and the rendering-boundary doc.

## Target architecture (what this stage adds)

```
packages/contracts/src/
  video-composition.ts   VideoCompositionDocumentV1 — the document contract
  video-templates.ts     VideoTemplateDefinition — the declarative template contract

packages/application/src/
  video-composition-engine.ts   evaluateVideoCompositionAtTime — pure temporal evaluator
  video-template-catalog.ts     one reference template ("classic-reveal")
  video-export-identity.ts      canonical export-request payload (no persistence)
  ports.ts (extended)           VideoFramePresenterPort, VideoExportRendererPort
```

Nothing under `apps/api` or `apps/mobile` was changed. No controller, route, DI wiring,
or mobile screen exists for video yet — this stage is contract, evaluator, and boundary
only, exactly as scoped.

## Package/module boundaries

- **Contracts** (`@dentpilot/contracts`) own validation and shape: what a valid
  `VideoCompositionDocumentV1` and `VideoTemplateDefinition` look like, with no
  behavior beyond `.parse()`/structural cross-checks.
- **Application** (`@dentpilot/application`) owns pure computation: given a valid
  document, template, and asset set, what should exist at time T
  (`evaluateVideoCompositionAtTime`), and what a coalescible export request looks like
  (`canonicalVideoExportRequestPayload`). Zero I/O, zero platform dependency.
- **Ports** (`packages/application/src/ports.ts`) declare the boundary to platform
  adapters (`VideoFramePresenterPort` for native preview, `VideoExportRendererPort` for
  encoding) without implementing or naming any concrete technology.
- **Future**: `apps/api` (persistence/routing) and `apps/mobile` (concrete preview/export
  adapters) are the next layer out — deliberately not touched in this stage.

## Data flow (once future stages wire persistence and adapters)

```
Mobile editor
  -> VideoCompositionDocumentV1 draft (validated by the contract)
  -> evaluateVideoCompositionAtTime(document, template, assets, timeMs, target)
  -> VideoRenderPlanAtTime (pure data: commands + canvas + style)
  -> VideoFramePresenterPort adapter (native Skia canvas, not built yet) — preview
  -> VideoExportRendererPort adapter (native/backend encoder, not built yet) — export
```

The evaluator is called once per frame by whichever adapter is driving it (a 60fps
native preview loop and a 30fps export sampler both call the same pure function with
different `timeMs` step sizes) — this is exactly the "FPS as render/export policy, not
document state" requirement from the Stage 1 command.

## Compatibility model

`CreationDocumentV1` (`packages/contracts/src/index.ts`) was not modified in any way —
same schema, same exports, same 10/10 existing tests passing unchanged. The video
contract lives in sibling files (`video-composition.ts`, `video-templates.ts`), is
re-exported additively from `packages/contracts/src/index.ts`
(`export * from './video-templates.js'; export * from './video-composition.js';`), and
shares only what already existed as reusable, general-purpose vocabulary:
`templateAspectRatioKeys`, `templateStyleTokens`, `editableTemplateTextKeys`,
`normalizedRectSchema` (all from `templates.ts`, unchanged), plus one new export —
`normalizedTransformSchema`/`NormalizedTransform` — promoted from a private `const` in
`index.ts` to a public export so `video-composition.ts` could reuse it instead of
duplicating it. That promotion is purely additive (a new export name; nothing existing
changed shape or behavior) and is covered by the unchanged, still-passing
`creation-document.test.ts` suite.

Routing between the two document types is by `CreationProject.type`
(`before_after_image` vs. `before_after_video`) plus each document's own
`schemaVersion` — no implicit heuristic parsing, exactly as required. This routing is
designed and documented here; the actual `creation-service.ts` dispatch is future work
(see the roadmap).
