# Phase 4 Closure — Stage 1 Final Micro-Closure Defect Map

## Scope boundary

This document maps only the two confirmed final Stage 1 defects: authoritative export-source ownership and post-save Creation query-cache coherence. Stage 2, Phase 5, persistence changes, media-semantic changes, dependency upgrades, and unrelated editor work are out of scope.

| ID | Root cause | Callers and boundary | State/persistence/cleanup boundary | Restored invariant | Deterministic proof |
|---|---|---|---|---|---|
| MC-A | `renderAuthoritativeCompositionExport` invokes `acquirePrivateExportSource` per logical binding, then stores results in `Map<mediaId, source>`. Duplicate media IDs overwrite the first owned source, making it unreachable for `finally`. | `export.tsx` calls `authoritative-composition-export.native.ts`; the latter owns `protected-export-source.ts` allocations and passes source URIs into the pure application render plan. | One export owns a `Map<mediaId, PrivateExportSource>` built from a stable unique media-ID sequence. Its `finally` releases each owned map value exactly once, irrespective of partial acquisition, render, or encode failure. | Each unique mediaId is acquired at most once; each successfully acquired source is released exactly once; bindings may share that one source URI. | Same-media double-binding, two-media, partial-failure, and render-failure tests instrument acquisition, source URI usage, and release counts. |
| MC-B | The autosave coordinator receives authoritative `document/revision/updatedAt`, but `onSaved` only invalidates `['creation', creationId]` asynchronously. Export and Template Gallery can read a previous cached draft during refetch. | `use-creation-editor.ts` owns draft-save acknowledgement; editor, Export, Template Gallery, and Save Version consume the same `['creation', creationId]` data. | A central helper patches only `draft.document`, `draft.revision`, and `draft.updatedAt` synchronously from server output and preserves project/bindings. It is monotonic by revision and can invalidate afterward for verification. | Before a save is reported as `saved`, the editor and query cache expose the same acknowledged authoritative draft. A later stale response cannot downgrade a newer cached revision. | Delayed-refetch immediate Export and Template Gallery reads; background invalidation; stale N+1 response after N+2 patch; genuine 409 conflict regression. |

## Migration decision

Neither defect changes Phase 3 media persistence nor Phase 4A Creation persistence. **No migration or Prisma schema change is permitted; migration count remains 13.**
