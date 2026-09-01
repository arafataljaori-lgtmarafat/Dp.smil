import { useEffect, useRef } from 'react';
import { InteractionManager } from 'react-native';

import { useAuth } from '../auth/auth-provider';
import { loadPrivatePreview } from './protected-preview-cache';

export function useCachePrewarmer(mediaIds: ReadonlyArray<string | null | undefined>): void {
  const { account } = useAuth();
  const prewarmed = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!account) return;

    const validMediaIds = mediaIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
    
    if (validMediaIds.length === 0) return;

    const task = InteractionManager.runAfterInteractions(() => {
      // Prewarm sequentially to avoid UI thread blocking / CPU spikes.
      void (async () => {
        for (const mediaId of validMediaIds) {
          if (prewarmed.current.has(mediaId)) continue;
          
          try {
            await loadPrivatePreview({ accountId: account.id, mediaId });
            prewarmed.current.add(mediaId);
          } catch (error) {
            // Silently ignore cache-warming errors. 
            // The editor will retry dynamically when rendering.
            console.warn(`[useCachePrewarmer] Failed to prewarm media ${mediaId}`, error);
          }
        }
      })();
    });

    return () => task.cancel();
  }, [account, mediaIds]);
}
