# Phase 5 — Roadmap After the Case-to-Video Architectural Rebase

Ordered so each step is incremental against the foundation delivered in Stage 1, not a
rewrite. No stage below is started by this document or this session.

## 1. Persist and wire `before_after_video`

- Extend `creation-service.ts` to accept `type: 'before_after_video'` alongside the
  existing `before_after_image` path, storing `VideoCompositionDocumentV1` in the same
  `CreationDraft`/`CreationRevision` `Json` columns (no migration needed — see the
  architecture doc's audit).
- Add the routing check (`project.type === 'before_after_video'` → parse with
  `videoCompositionDocumentV1Schema`; `'before_after_image'` → parse with
  `creationDocumentV1Schema`) at the exact point `creation-service.ts` currently
  hard-codes the image path.
- Add API contracts/controllers mirroring the existing creation endpoints, reusing the
  same idempotency/revision-conflict discipline already proven for images.

## 2. Mobile real-time preview

- Build the first `VideoFramePresenterPort` adapter, most naturally alongside
  `native-composition-preview.native.tsx`, driving `evaluateVideoCompositionAtTime` from
  a native animation-frame loop.
- Reuse Phase 4's protected-export-source acquisition pattern for whichever media
  sources the preview needs resident.
- Web preview (parity with `native-composition-preview.web.tsx`'s existing role as a
  secondary/support surface) can follow once native preview is proven.

## 3. Deterministic video encoding/export

- Build the first `VideoExportRendererPort` adapter. Evaluate native
  (AVFoundation/MediaCodec-class) vs. backend rendering **at that time**, against
  whatever cost/latency/device data exists then — this stage deliberately does not
  prejudge that choice.
- Wire `canonicalVideoExportRequestPayload` into an actual idempotent request path,
  including the proposed `VideoExportJob`/`VideoExportVersion` persistence model
  documented (not implemented) in the rendering-boundary doc.
- Extend the output mime/format assertions and failure-code taxonomy analogous to the
  existing `GenerationFailureCode` pattern, but scoped to rendering failures, not AI
  provider failures.

## 4. Premium templates, branding, audio

- Grow the video template catalog beyond the single `classic-reveal` reference template,
  reusing `validateVideoTemplateCatalog` unchanged.
- Implement actual audio playback/mixing behind `videoAudioReferenceSchema`, which today
  only validates shape.
- Add whatever additional motion/transition primitives real template designs need,
  each added to the closed `motionPrimitiveTypes`/`transitionPrimitiveTypes` tables the
  same way `easingKeys` is closed today.

## 5. Performance/device validation

- Real memory, encode-latency, and battery profiling on physical Android/iOS
  devices — mirrors the external-device gate already established in Phase 4
  Stage 2 (`docs/phase-4-external-device-acceptance-checklist.md`); a video-specific
  checklist should follow that same shape once an adapter exists to test.

## 6. Product-flow polish

- Editor UI for timeline/segment/transition editing, template selection, and
  preview scrubbing. Explicitly out of scope for every stage before this one.

## 7. Smile AI as an independent later capability

- Phase 5 Stage 0's provider research and decision
  (`docs/phase-5-stage-0-smile-ai-decision.md`,
  `docs/phase-5-smile-ai-provider-benchmark.md`,
  `docs/phase-5-smile-ai-threat-model.md`) remain valid and untouched. Smile AI proceeds
  independently, on its own controlled-benchmark gate, once the video foundation above
  is stable — the two tracks do not block each other, and this stage did not merge or
  reprioritize between them beyond what the Stage 1 command explicitly directed (video
  composition as the primary product path; Smile AI as a separate optional capability).

Adjusted only where repository evidence proves a better order; no evidence surfaced this
session suggesting a different sequence than the one requested.
