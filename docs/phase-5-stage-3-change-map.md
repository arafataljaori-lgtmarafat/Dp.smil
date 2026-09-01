# Phase 5 Stage 3: Change Map

- `video-playback-clock.ts`: Implemented strict deterministic monotonic `PlaybackClock` and scheduler interfaces.
- `use-video-preview-session.ts`: Deduplicates mediaId globally and bounds real media dimensions.
- `video-preview.native.tsx`: High-performance React Native Skia frame tick adapter and bounded scrubber.
- `video-creation-preview.tsx`: Routes the video creation type from the product level into the preview logic.
- `apps/mobile/app/creations/[creationId].tsx`: Added dynamic routing logic based on `CreationProject.type`.
- `image-creation-editor.tsx`: Maintained exact semantic isolation of static image flow.
