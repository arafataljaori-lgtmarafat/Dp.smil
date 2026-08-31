# Phase 4 Closure — Stage 1 Defect Map

## Scope boundary

This document records only the confirmed defects from the Stage 1 closure specification. Phase 5, AI, video, clinic/team concepts, migrations, and framework upgrades are out of scope. The Phase 4A owner-scoped persistence and immutable provenance remain authoritative.

| ID | Confirmed root cause | Affected boundary/files | Invariant to restore | Proof required |
|---|---|---|---|---|
| S1-01 | Revision POST advances server draft revision while editor coordinator remains at its earlier revision. | `app/creations/[creationId].tsx`, `use-creation-editor.ts`, Creation revision API/client. | After Save Version, editor CAS revision equals authoritative draft revision before any next mutation. | HTTP/API regression plus coordinator test: revision N → N+1 → next draft write succeeds; true remote conflict remains 409. |
| S1-02 | Export plan uses target dimensions but captures the visible preview Canvas. | `export.tsx`, `native-composition-preview.native.tsx`, new offscreen renderer boundary. | Encoded file dimensions equal the selected preset and contain composition only. | Decode real encoded files for 1:1, 4:5, 9:16, and 16:9; exclude editor overlay commands. |
| S1-03 | Export loader can reuse preview JPEG derivatives. | `protected-preview-cache.ts`, export source loader, export renderer. | Preview derivative and export source are distinct; export resolves private authoritative source. | Instrumented test proves export does not invoke preview loader where source exceeds preview dimensions. |
| S1-04 | UI accepts text/style values beyond shared document/template contract. | editor screen, `editor-operations.ts`, application validation. | Ordinary UI actions cannot create a renderer-crashing document. | Tests for overlong/forbidden text and unsupported/unknown styles; controlled error boundary. |
| S1-05 | Template switching preserves incompatible themes/options. | `editor-operations.ts`, template catalog/composition engine. | Every A → B switch produces a document accepted by B. | Pairwise built-in catalog transition test and known incompatible theme case. |
| S1-06 | Skia adapter uses one fixed font instead of command font sizes. | `native-composition-preview.native.tsx`. | `RenderPlan` command typography is rendered exactly. | Adapter instrumentation with distinct planned text sizes. |
| S1-07 | Export cache has a global path and no identity-change cleanup. | `composition-export.ts`, `auth-provider.tsx`. | All patient-derived temporary files are identity-scoped, bounded, and cleared on identity change. | User-A export → logout → User-B cannot discover it; same-process account switch. |
| S1-08 | Preview count eviction slice permits count-based deletion below limit. | `protected-preview-cache.ts`. | Count ≤ 12 has zero count eviction; excess only is evicted deterministically. | Exact retained counts for 0, 1, 11, 12, 13, and 20. |
| S1-09/10 | Preview rejects a valid source before native resize and forces a 1440-wide resize. | `protected-preview-cache.ts`. | Valid Phase 3 media has controlled preview treatment; max edge is bounded without upscale or ratio distortion. | Size calculation tests for 4000×3000, 3000×4000, 900×1200, 1200×900, 500×500. |
| S1-11 | Hook coordinator depends on unstable input object; disposal only clears timer. | `use-creation-editor.ts`, `editor-autosave.ts`. | One session owns one coordinator; unmount cancels work and ignores late responses. | Timer and in-flight-unmount lifecycle tests. |
| S1-12 | Bind/swap reload returned server draft despite dirty local document. | editor screen and coordinator. | Binding mutation first checkpoints dirty document; failed/conflicted checkpoint prohibits binding mutation. | Dirty text + rebind/swap preservation, plus failure/conflict preflight tests. |
| S1-13/14 | Export/media lifecycle is implicit and composition failures can propagate to route tree. | native preview/export, cache, editor screen. | Temporary files/native render paths have cleanup; composition failure renders safe local recovery UI. | Resource cleanup and error-boundary test with controlled safe diagnostic. |

## Migration decision

No persistence schema alteration is necessary for these defects. Migration count must remain at **13**.
