# Native Preview Architecture

The native preview relies on a unidirectional data flow starting from the routed product UI (`VideoCreationPreview`). Real media dimensions are sourced directly from the authenticated graph to avoid mock geometry artifacts. The `useVideoPreviewSession` boundary deduplicates required bindings by `mediaId`. Rendering commands are executed via Shopify's React Native Skia using localized updates.
