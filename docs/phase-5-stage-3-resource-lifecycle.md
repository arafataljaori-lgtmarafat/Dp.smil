# Resource Lifecycle

Native images (`CreationRenderAsset`) are bound securely by mapping exact `mediaId` constraints. Stale async resolution from `loadPrivatePreview` is discarded seamlessly upon unmount to prevent crossover. Native `SkiaImage` resources follow the `useImage` hook lifecycle safely. Memory stability is maintained by suspending all frame evaluations and scheduler allocations when the UI is explicitly backgrounded.
