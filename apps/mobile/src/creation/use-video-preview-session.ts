import { useEffect, useState, useMemo, useRef } from 'react';
import type { CreationBindingKey, VideoCompositionDocument, VideoTemplateDefinition } from '@dentpilot/contracts';
import type { CreationRenderAsset } from '@dentpilot/application';
import { loadPrivatePreview } from './protected-preview-cache';

export type PreviewSessionIdentity = {
  readonly projectId: string;
  readonly revisionId: string | 'draft';
  readonly templateId: string;
  readonly templateVersion: number;
};

export type SessionErrorClassification = 
  | 'invalid_document'
  | 'missing_media'
  | 'acquisition_failure'
  | 'invalid_dimensions';

export type VideoPreviewSessionState =
  | { readonly state: 'LOADING' }
  | { readonly state: 'READY'; readonly assets: readonly CreationRenderAsset[] }
  | { readonly state: 'ERROR'; readonly error: Error; readonly classification: SessionErrorClassification };

// F4: Deduplicate by mediaId globally for the session
// F3: Require actual dimensions from the graph

export type WorkspaceMediaMetadata = {
  readonly mediaId: string;
  readonly originalWidth: number;
  readonly originalHeight: number;
};

function computeBindingFingerprint(bindings: Record<string, { readonly mediaId: string }>): string {
  const keys = Object.keys(bindings).sort();
  return keys.map((k) => `${k}:${bindings[k].mediaId}`).join('|');
}

export function useVideoPreviewSession(
  accountId: string,
  identity: PreviewSessionIdentity,
  document: VideoCompositionDocument,
  template: VideoTemplateDefinition,
  mediaGraph: Record<string, WorkspaceMediaMetadata>
): VideoPreviewSessionState {
  const [state, setState] = useState<VideoPreviewSessionState>({ state: 'LOADING' });
  const pendingRequests = useRef(new Map<string, Promise<string>>());

  const sessionSignature = useMemo(() => {
    return [
      identity.projectId,
      identity.revisionId,
      identity.templateId,
      identity.templateVersion,
      computeBindingFingerprint(document.assetBindings)
    ].join('::');
  }, [identity, document.assetBindings]);

  useEffect(() => {
    let cancelled = false;
    setState({ state: 'LOADING' });

    async function load() {
      try {
        const requiredKeys = new Set(template.segments.map(s => s.bindingKey));
        const assets: CreationRenderAsset[] = [];
        
        // F4: deduplicate fetches by mediaId
        const fetchedUris = new Map<string, string>();
        
        for (const key of requiredKeys) {
          const binding = document.assetBindings[key as keyof typeof document.assetBindings] as { mediaId: string } | undefined;
          if (!binding) {
             throw { type: 'missing_media', error: new Error(`Missing binding for ${key}`) };
          }
          
          const meta = mediaGraph[binding.mediaId];
          if (!meta || !meta.originalWidth || !meta.originalHeight) {
             throw { type: 'invalid_dimensions', error: new Error(`Missing or invalid dimensions for media ${binding.mediaId}`) };
          }

          let uriPromise = pendingRequests.current.get(binding.mediaId);
          if (!uriPromise) {
            uriPromise = loadPrivatePreview({ accountId, mediaId: binding.mediaId }).catch(e => {
              throw { type: 'acquisition_failure', error: e instanceof Error ? e : new Error(String(e)) };
            });
            pendingRequests.current.set(binding.mediaId, uriPromise);
          }

          const uri = await uriPromise;
          fetchedUris.set(binding.mediaId, uri);
          
          assets.push({
            bindingKey: key as CreationBindingKey,
            mediaId: binding.mediaId,
            source: uri,
            width: meta.originalWidth, // F3: actual dimensions
            height: meta.originalHeight
          });
        }

        if (!cancelled) {
          setState({ state: 'READY', assets });
        }
      } catch (err: any) {
        if (!cancelled) {
          const classification = err.type as SessionErrorClassification || 'invalid_document';
          const error = err.error || (err instanceof Error ? err : new Error(String(err)));
          setState({ state: 'ERROR', error, classification });
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [accountId, sessionSignature, document.assetBindings, template.segments, mediaGraph]);

  return state;
}
